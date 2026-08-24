import { describe, expect, it, vi } from "vitest";

import { apply, createHttpManagementClient } from "../src/client.js";

describe("unified resource management client", () => {
  it("registers two entries from one client plugin", () => {
    const registerTab = vi.fn((descriptor: { readonly id: string; readonly title: string }) => {
      void descriptor;
      return () => undefined;
    });
    const ctx = {
      betterSidebar: { registerTab },
      effect: (factory: () => () => void) => factory(),
    };

    apply(ctx as never);

    expect(registerTab.mock.calls.map(([tab]) => tab.id)).toEqual([
      "dsh-resource-management:plugins",
      "dsh-resource-management:skills",
    ]);
    expect(registerTab.mock.calls.map(([tab]) => tab.title)).toEqual(["插件管理", "Skill 管理"]);
  });

  it("uses one same-origin API and exposes document navigation", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ ok: true, value: {} }), { status: 200 }));
    const client = createHttpManagementClient(request as typeof fetch);

    await client.document?.("plugin:fixture", "docs/guide.md");

    expect(request).toHaveBeenCalledWith("/dsh-resource-management/api", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({
        method: "document",
        params: { resourceId: "plugin:fixture", relativePath: "docs/guide.md" },
      }),
    }));
  });

  it("turns an interrupted empty response into a restart-aware error", async () => {
    const request = vi.fn(async () => new Response("", { status: 200 }));
    const client = createHttpManagementClient(request as typeof fetch);

    await expect(client.list("plugin")).rejects.toMatchObject({
      code: "EMPTY_RESPONSE",
      message: expect.stringContaining("等待 DSH 恢复"),
    });
  });
});
