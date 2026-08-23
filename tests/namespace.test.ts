import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { PanelDefinition } from "@linmu/dsh-management-kit/contract";
import { afterEach, describe, expect, it } from "vitest";

import { NamespacedJsonPanelPersistenceAdapter } from "../src/host/runtime-adapters.js";

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

const panel: PanelDefinition = {
  contractVersion: 1,
  sections: [{
    id: "general",
    title: "General",
    fields: [{
      id: "enabled",
      type: "switch",
      label: "Enabled",
      default: true,
      apply: "save",
      binding: { kind: "profile", namespace: "fixture", key: "enabled" },
    }],
  }],
  actions: [],
};

describe("namespaced panel persistence", () => {
  it("stores Plugin and Skill values in separate namespaces in one document", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dsh-resource-values-"));
    temporary.push(root);
    const filename = path.join(root, "panel-values.json");
    const persistence = new NamespacedJsonPanelPersistenceAdapter(filename);

    await persistence.commit("plugin:one", panel, [{ op: "set", field: panel.sections[0]!.fields[0]!, value: false }], 0);
    await persistence.commit("skill:one", panel, [{ op: "set", field: panel.sections[0]!.fields[0]!, value: true }], 1);

    const document = JSON.parse(await readFile(filename, "utf8")) as Record<string, unknown>;
    expect(document).toMatchObject({
      schemaVersion: 1,
      revision: 2,
      plugins: { "plugin:one": { enabled: { type: "switch", value: false } } },
      skills: { "skill:one": { enabled: { type: "switch", value: true } } },
    });
  });
});

