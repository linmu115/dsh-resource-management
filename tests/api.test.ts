import { describe, expect, it } from "vitest";

import { dispatchManagementRequest } from "../src/host/api.js";

describe("unified resource management API", () => {
  it("allows the shared resource contract and rejects unknown lifecycle methods", async () => {
    const service = {
      list: async () => [],
      document: async () => ({ path: "README.md" }),
      categories: async () => ({ kind: "plugin", revision: 0 }),
    };

    await expect(dispatchManagementRequest(service, { method: "document", params: {} })).resolves.toMatchObject({
      ok: true,
      value: { path: "README.md" },
    });
    await expect(dispatchManagementRequest(service, { method: "install", params: {} })).resolves.toMatchObject({
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED" },
    });
  });
});

