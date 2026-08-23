import type { IncomingMessage, ServerResponse } from "node:http";

import type { ReadmeAssetAuthorization } from "@linmu/dsh-management-kit/host";

export interface AssetResolver {
  authorizeAsset(assetBaseUrl: string, relativePath: string): Promise<ReadmeAssetAuthorization>;
}

const routePrefix = "/dsh-resource-management/assets/";

function json(res: ServerResponse, status: number, code: string): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify({ ok: false, error: { code, message: "资源图片不可用" } }));
}

function requestParts(url: string): { readonly assetBaseUrl: string; readonly relativePath: string } | undefined {
  const parsed = new URL(url, "http://dsh-resource-management.invalid");
  const pathname = parsed.pathname;
  if (!pathname.startsWith(routePrefix)) return undefined;
  const rest = pathname.slice(routePrefix.length);
  const slash = rest.indexOf("/");
  if (slash <= 0 || slash === rest.length - 1) return undefined;
  const token = rest.slice(0, slash);
  const relativePath = rest.slice(slash + 1);
  return {
    assetBaseUrl: `${routePrefix}${token}/`,
    relativePath,
  };
}

export function createAssetHttpHandler(resolver: AssetResolver) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("allow", "GET, HEAD");
      json(res, 405, "METHOD_NOT_ALLOWED");
      return;
    }
    const parts = requestParts(req.url ?? "");
    if (parts === undefined) {
      json(res, 404, "ASSET_NOT_FOUND");
      return;
    }
    try {
      const asset = await resolver.authorizeAsset(parts.assetBaseUrl, parts.relativePath);
      res.writeHead(200, {
        "content-type": asset.mimeType,
        "content-length": String(asset.size),
        "cache-control": "private, max-age=300",
        "etag": asset.etag,
        "x-content-type-options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : asset.bytes);
    } catch {
      json(res, 404, "ASSET_NOT_FOUND");
    }
  };
}
