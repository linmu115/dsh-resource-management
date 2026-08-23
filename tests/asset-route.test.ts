import { describe, expect, it, vi } from "vitest";

import { createAssetHttpHandler } from "../src/host/asset-route.js";

describe("README asset route", () => {
  it("serves only an authorized image with private nosniff headers", async () => {
    const authorizeAsset = vi.fn(async () => ({
      filename: "hidden.png",
      relativePath: "images/demo.png",
      mimeType: "image/png" as const,
      size: 8,
      etag: '"sha256-fixture"',
      bytes: Buffer.from([1, 2, 3]),
    }));
    const handler = createAssetHttpHandler({ authorizeAsset });
    const headers: Record<string, string> = {};
    let status = 0;
    let body: unknown;
    const response = {
      writeHead(nextStatus: number, nextHeaders: Record<string, string>) {
        status = nextStatus;
        Object.assign(headers, nextHeaders);
      },
      end(nextBody?: unknown) { body = nextBody; },
    };

    await handler({ method: "GET", url: "/dsh-resource-management/assets/token/images/demo.png" } as never, response as never);

    expect(status).toBe(200);
    expect(headers).toMatchObject({
      "content-type": "image/png",
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=300",
      etag: '"sha256-fixture"',
    });
    expect(body).toEqual(Buffer.from([1, 2, 3]));
    expect(authorizeAsset).toHaveBeenCalledWith(
      "/dsh-resource-management/assets/token/",
      "images/demo.png",
    );
  });
});
