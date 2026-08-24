import { settingsNamespace, type SettingsDescriptor, type SettingsProvider } from "@deepseek-ai/dsh-settings";
import type { PanelDefinition, PanelFieldDefinition } from "@linmu/dsh-management-kit/contract";
import type {
  SettingsAdapter,
  SettingsChange,
  SettingsSnapshot,
  StoredPanelField,
} from "@linmu/dsh-management-kit/host";

type SettingsProviderFace = Pick<SettingsProvider, "describe" | "mutate" | "writable">;

function settingsFields(definition: PanelDefinition): PanelFieldDefinition[] {
  return definition.sections.flatMap((section) => section.fields)
    .filter((field) => field.binding.kind === "dsh-settings");
}

function pathOf(key: string): string[] {
  return key.split(".");
}

function readPath(value: unknown, path: readonly string[]): { readonly found: boolean; readonly value?: unknown } {
  let current = value;
  for (const segment of path) {
    if (typeof current !== "object" || current === null || Array.isArray(current) || !Object.hasOwn(current, segment)) {
      return { found: false };
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return { found: true, value: structuredClone(current) };
}

function descriptorMap(provider: SettingsProviderFace): Map<string, SettingsDescriptor> {
  return new Map(provider.describe({ redactSecrets: true }).map((descriptor) => [String(descriptor.ns), descriptor]));
}

function revisionToken(fields: readonly PanelFieldDefinition[], descriptors: ReadonlyMap<string, SettingsDescriptor>): string {
  const namespaces = [...new Set(fields.flatMap((field) => field.binding.kind === "dsh-settings" ? [field.binding.namespace] : []))].sort();
  return JSON.stringify(Object.fromEntries(namespaces.map((namespace) => [namespace, descriptors.get(namespace)?.revision ?? null])));
}

export class DshSettingsPanelAdapter implements SettingsAdapter {
  constructor(private readonly provider: () => SettingsProviderFace | undefined) {}

  async read(_resourceId: string, definition: PanelDefinition): Promise<SettingsSnapshot> {
    const fields = settingsFields(definition);
    if (fields.length === 0) return { revision: "{}", fields: {} };
    const provider = this.provider();
    if (provider === undefined) return this.unavailable(fields, "当前 DSH 环境没有可用的 Settings Provider");
    const descriptors = descriptorMap(provider);
    const values: Record<string, StoredPanelField> = {};
    for (const field of fields) {
      if (field.binding.kind !== "dsh-settings") continue;
      const descriptor = descriptors.get(field.binding.namespace);
      if (descriptor === undefined) {
        values[field.id] = {
          present: false,
          writable: false,
          unavailableReason: `目标资源尚未注册 Settings namespace：${field.binding.namespace}`,
        };
        continue;
      }
      const resolved = readPath(descriptor.value, pathOf(field.binding.key));
      values[field.id] = resolved.found
        ? { present: true, type: field.type, value: resolved.value, writable: provider.writable }
        : { present: false, writable: provider.writable };
    }
    return { revision: revisionToken(fields, descriptors), fields: values };
  }

  async commit(
    resourceId: string,
    definition: PanelDefinition,
    changes: readonly SettingsChange[],
    expectedRevision: string,
  ): Promise<SettingsSnapshot> {
    const provider = this.provider();
    if (provider === undefined || !provider.writable) throw new Error("DSH Settings Provider is unavailable or read-only");
    const fields = settingsFields(definition);
    const descriptors = descriptorMap(provider);
    if (revisionToken(fields, descriptors) !== expectedRevision) throw new Error("DSH settings revision conflict");
    const groups = new Map<string, SettingsChange[]>();
    for (const change of changes) {
      if (change.field.binding.kind !== "dsh-settings") throw new Error("non-settings field routed to DSH Settings");
      const current = groups.get(change.field.binding.namespace) ?? [];
      current.push(change);
      groups.set(change.field.binding.namespace, current);
    }
    for (const [namespace, namespaceChanges] of groups) {
      const descriptor = descriptors.get(namespace);
      if (descriptor === undefined) throw new Error(`Settings namespace is not registered: ${namespace}`);
      await provider.mutate(
        settingsNamespace(namespace),
        namespaceChanges.map((change) => {
          if (change.field.binding.kind !== "dsh-settings") throw new Error("unreachable");
          return change.op === "unset"
            ? { op: "unset" as const, path: pathOf(change.field.binding.key) }
            : { op: "set" as const, path: pathOf(change.field.binding.key), value: structuredClone(change.value) };
        }),
        descriptor.revision,
      );
    }
    return this.read(resourceId, definition);
  }

  private unavailable(fields: readonly PanelFieldDefinition[], reason: string): SettingsSnapshot {
    return {
      revision: "unavailable",
      fields: Object.fromEntries(fields.map((field) => [field.id, {
        present: false,
        writable: false,
        unavailableReason: reason,
      }])),
    };
  }
}
