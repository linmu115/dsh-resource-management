import { describe, expect, it, vi } from "vitest";

import { ResourceManagementService } from "../src/host/service.js";

describe("ResourceManagementService", () => {
  it("keeps Plugin and Skill catalogs and category namespaces separate", async () => {
    const pluginResources = [{ resourceId: "plugin:one", kind: "plugin" as const }];
    const skillResources = [{ resourceId: "skill:one", kind: "skill" as const }];
    const catalog = {
      list: vi.fn(async (kind: "plugin" | "skill") => kind === "plugin" ? pluginResources : skillResources),
      detail: vi.fn(),
      document: vi.fn(),
      definition: vi.fn(async () => undefined),
    };
    const service = new ResourceManagementService({
      catalog: catalog as never,
      runtime: {} as never,
      control: {} as never,
      categories: {
        plugin: { snapshot: vi.fn(async () => ({ kind: "plugin" })) } as never,
        skill: { snapshot: vi.fn(async () => ({ kind: "skill" })) } as never,
      },
    });

    await expect(service.list({ kind: "plugin" })).resolves.toEqual(pluginResources);
    await expect(service.list({ kind: "skill" })).resolves.toEqual(skillResources);
    await expect(service.categories({ kind: "plugin" })).resolves.toMatchObject({ kind: "plugin" });
    await expect(service.categories({ kind: "skill" })).resolves.toMatchObject({ kind: "skill" });
  });

  it("rejects Skill enable/disable requests", async () => {
    const service = new ResourceManagementService({
      catalog: { list: vi.fn(), detail: vi.fn(), document: vi.fn(), definition: vi.fn() } as never,
      runtime: {} as never,
      control: { setEnabled: vi.fn() } as never,
      categories: {} as never,
    });

    await expect(service.setPluginEnabled({ resourceId: "skill:one", enabled: false, expectedRevision: 1 }))
      .rejects.toThrow(/plugin resource id/i);
  });
});
