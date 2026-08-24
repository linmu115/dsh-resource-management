import { describe, expect, it } from "vitest";

import { panelDefinitionSchema, type PanelDefinition } from "@linmu/dsh-management-kit/contract";
import { DshSettingsPanelAdapter } from "../src/host/settings-adapter.js";

function panel(): PanelDefinition {
  return panelDefinitionSchema.parse({
    contractVersion: 2,
    sections: [{ id: "main", title: "Main", fields: [
      {
        id: "max-members",
        type: "number",
        label: "Max members",
        default: 8,
        min: 1,
        apply: "save",
        binding: { kind: "dsh-settings", namespace: "agent-teams", key: "maxMembers" },
      },
      {
        id: "prompt-order",
        type: "number",
        label: "Prompt order",
        default: 117,
        apply: "restart-required",
        binding: { kind: "dsh-settings", namespace: "agent-teams-startup", key: "prompt.section.order" },
      },
    ] }],
    actions: [],
  });
}

describe("DSH Settings panel adapter", () => {
  it("reads resolved values and mutates exact paths with per-namespace revisions", async () => {
    const values = new Map<string, Record<string, unknown>>([
      ["agent-teams", { maxMembers: 8 }],
      ["agent-teams-startup", { prompt: { section: { order: 117 } } }],
    ]);
    const revisions = new Map<string, number>([["agent-teams", 2], ["agent-teams-startup", 5]]);
    const calls: Array<{ namespace: string; ops: readonly unknown[]; revision?: number }> = [];
    const provider = {
      writable: true,
      describe: () => [...values].map(([namespace, value]) => ({
        ns: namespace,
        schema: {},
        value: structuredClone(value),
        revision: revisions.get(namespace) ?? 0,
        applies: namespace.endsWith("startup") ? "restart" : "live",
      })),
      mutate: async (namespace: string, ops: ReadonlyArray<{ op: "set" | "unset"; path: readonly string[]; value?: unknown }>, revision?: number) => {
        calls.push({ namespace: String(namespace), ops, revision });
        revisions.set(String(namespace), (revisions.get(String(namespace)) ?? 0) + 1);
      },
    };
    const adapter = new DshSettingsPanelAdapter(() => provider as never);
    const definition = panel();
    const initial = await adapter.read("plugin:agent-teams", definition);
    expect(initial.fields["max-members"]?.value).toBe(8);
    expect(initial.fields["prompt-order"]?.value).toBe(117);

    await adapter.commit("plugin:agent-teams", definition, [
      { op: "set", field: definition.sections[0]!.fields[0]!, value: 12 },
      { op: "unset", field: definition.sections[0]!.fields[1]! },
    ], initial.revision);
    expect(calls).toEqual([
      { namespace: "agent-teams", ops: [{ op: "set", path: ["maxMembers"], value: 12 }], revision: 2 },
      { namespace: "agent-teams-startup", ops: [{ op: "unset", path: ["prompt", "section", "order"] }], revision: 5 },
    ]);
  });

  it("fails closed when the target namespace is not registered", async () => {
    const adapter = new DshSettingsPanelAdapter(() => ({ writable: true, describe: () => [], mutate: async () => undefined } as never));
    const snapshot = await adapter.read("plugin:agent-teams", panel());
    expect(snapshot.fields["max-members"]).toMatchObject({ writable: false, present: false });
    expect(snapshot.fields["max-members"]?.unavailableReason).toMatch(/尚未注册/);
  });
});
