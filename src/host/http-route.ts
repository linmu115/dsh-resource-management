import type { IncomingMessage, ServerResponse } from "node:http";

import { dispatchManagementRequest, type ResourceManagementServiceFace } from "./api.js";
import { ResponseCompletionScheduler } from "./response-completion.js";

const MAX_REQUEST_BYTES = 1024 * 1024;

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

function sameOrigin(req: IncomingMessage): boolean {
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  const host = req.headers.host;
  if (host === undefined) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    bytes += value.byteLength;
    if (bytes > MAX_REQUEST_BYTES) throw Object.assign(new Error("request body too large"), { code: "REQUEST_TOO_LARGE" });
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createManagementHttpHandler(
  service: ResourceManagementServiceFace,
  responseCompletion = new ResponseCompletionScheduler(),
) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "POST") {
      res.setHeader("allow", "POST");
      writeJson(res, 405, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "只接受 POST" } });
      return;
    }
    if (!sameOrigin(req)) {
      writeJson(res, 403, { ok: false, error: { code: "ORIGIN_REJECTED", message: "请求来源不受信任" } });
      return;
    }
    if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
      writeJson(res, 415, { ok: false, error: { code: "CONTENT_TYPE_REQUIRED", message: "需要 JSON 请求" } });
      return;
    }
    try {
      const body = await readBody(req);
      if (typeof body !== "object" || body === null || Array.isArray(body) || !("method" in body)) throw new TypeError("invalid request envelope");
      const input = body as { readonly method?: unknown; readonly params?: unknown };
      if (typeof input.method !== "string") throw new TypeError("invalid request method");
      const method = input.method;
      const captured = await responseCompletion.capture(() => dispatchManagementRequest(service, {
        method,
        ...(input.params === undefined ? {} : { params: input.params }),
      }));
      if (captured.tasks.length > 0) {
        res.once("finish", () => responseCompletion.flush(captured.tasks));
      }
      writeJson(res, 200, captured.value);
    } catch (error) {
      const tooLarge = typeof error === "object" && error !== null && "code" in error && error.code === "REQUEST_TOO_LARGE";
      writeJson(res, tooLarge ? 413 : 400, {
        ok: false,
        error: { code: tooLarge ? "REQUEST_TOO_LARGE" : "INVALID_REQUEST", message: tooLarge ? "请求过大" : "请求格式无效" },
      });
    }
  };
}
