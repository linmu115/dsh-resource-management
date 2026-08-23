import { createRequire } from "node:module";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { PanelDefinition, PanelFieldDefinition } from "@linmu/dsh-management-kit/contract";
import type {
  CredentialAdapter,
  CredentialChange,
  CredentialSnapshot,
  PanelPersistenceAdapter,
  PanelPersistenceChange,
  PanelPersistenceSnapshot,
  PluginPackageAdapter,
  ResolvedPluginPackage,
  StoredPanelField,
} from "@linmu/dsh-management-kit/host";

interface StoredValue { readonly type: PanelFieldDefinition["type"]; readonly value: unknown; }
type NamespaceValues = Readonly<Record<string, Readonly<Record<string, StoredValue>>>>;
interface ValueDocument {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly plugins: NamespaceValues;
  readonly skills: NamespaceValues;
}

function emptyDocument(): ValueDocument {
  return { schemaVersion: 1, revision: 0, plugins: {}, skills: {} };
}

function panelFields(definition: PanelDefinition): PanelFieldDefinition[] {
  return definition.sections.flatMap((section) => section.fields);
}

function validNamespace(value: unknown): value is NamespaceValues {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validDocument(value: unknown): value is ValueDocument {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.schemaVersion === 1
    && Number.isInteger(record.revision)
    && validNamespace(record.plugins)
    && validNamespace(record.skills);
}

function namespaceFor(resourceId: string): "plugins" | "skills" {
  if (resourceId.startsWith("plugin:")) return "plugins";
  if (resourceId.startsWith("skill:")) return "skills";
  throw new TypeError("resource id must belong to Plugin or Skill namespace");
}

async function writeAtomic(filename: string, document: ValueDocument): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${String(process.pid)}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, filename);
  } finally {
    await rm(temporary, { force: true });
  }
}

export class NodePluginPackageAdapter implements PluginPackageAdapter {
  private readonly require: NodeRequire;

  constructor(baseUrl: URL | string = import.meta.url) {
    this.require = createRequire(baseUrl);
  }

  async resolve(moduleName: string): Promise<ResolvedPluginPackage | undefined> {
    let packageFile: string;
    try {
      packageFile = this.require.resolve(`${moduleName}/package.json`);
    } catch {
      let entryFile: string;
      try { entryFile = this.require.resolve(moduleName); } catch { return undefined; }
      const found = await this.findPackageFile(entryFile, moduleName);
      if (found === undefined) return undefined;
      packageFile = found;
    }
    return { packageName: moduleName, root: await realpath(path.dirname(packageFile)) };
  }

  private async findPackageFile(entryFile: string, expectedName: string): Promise<string | undefined> {
    let directory = path.dirname(entryFile);
    while (true) {
      const candidate = path.join(directory, "package.json");
      try {
        const parsed = JSON.parse(await readFile(candidate, "utf8")) as { name?: unknown };
        if (parsed.name === expectedName) return candidate;
      } catch { /* Continue to the parent package root. */ }
      const parent = path.dirname(directory);
      if (parent === directory) return undefined;
      directory = parent;
    }
  }
}

export class NamespacedJsonPanelPersistenceAdapter implements PanelPersistenceAdapter {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly filename: string) {}

  async read(resourceId: string, definition: PanelDefinition): Promise<PanelPersistenceSnapshot> {
    await this.queue;
    return this.snapshot(await this.readDocument(), resourceId, definition);
  }

  commit(resourceId: string, definition: PanelDefinition, changes: readonly PanelPersistenceChange[], expectedRevision: number): Promise<PanelPersistenceSnapshot> {
    const operation = this.queue.then(async () => {
      const current = await this.readDocument();
      if (current.revision !== expectedRevision) throw new Error("panel persistence revision conflict");
      const namespace = namespaceFor(resourceId);
      const namespaces = {
        plugins: structuredClone(current.plugins) as Record<string, Record<string, StoredValue>>,
        skills: structuredClone(current.skills) as Record<string, Record<string, StoredValue>>,
      };
      const values = namespaces[namespace][resourceId] ?? {};
      namespaces[namespace][resourceId] = values;
      for (const change of changes) {
        if (change.field.binding.kind === "credential") throw new Error("credential field routed to JSON persistence");
        if (change.op === "unset") delete values[change.field.id];
        else values[change.field.id] = { type: change.field.type, value: structuredClone(change.value) };
      }
      const next: ValueDocument = { schemaVersion: 1, revision: current.revision + 1, ...namespaces };
      await writeAtomic(this.filename, next);
      return this.snapshot(next, resourceId, definition);
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async readDocument(): Promise<ValueDocument> {
    try {
      if ((await stat(this.filename)).size > 2 * 1024 * 1024) throw new Error("panel value document exceeds 2 MiB");
      const parsed: unknown = JSON.parse(await readFile(this.filename, "utf8"));
      if (!validDocument(parsed)) throw new Error("invalid unified panel value document");
      return parsed;
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return emptyDocument();
      throw error;
    }
  }

  private snapshot(document: ValueDocument, resourceId: string, definition: PanelDefinition): PanelPersistenceSnapshot {
    const stored = document[namespaceFor(resourceId)][resourceId] ?? {};
    const fields: Record<string, StoredPanelField> = {};
    for (const field of panelFields(definition)) {
      if (field.binding.kind === "credential") continue;
      const value = stored[field.id];
      fields[field.id] = value === undefined
        ? { present: false, writable: true }
        : { present: true, type: value.type, value: structuredClone(value.value), writable: true };
    }
    return { revision: document.revision, fields };
  }
}

export interface CredentialProviderLike {
  describe(ref: string): Promise<{ readonly configured: boolean; readonly writable: boolean }>;
  set(ref: string, value: string): Promise<void>;
  unset(ref: string): Promise<void>;
}

export class DshCredentialAdapter implements CredentialAdapter {
  private revision = 0;
  constructor(private readonly provider: CredentialProviderLike) {}

  async read(_resourceId: string, definition: PanelDefinition): Promise<CredentialSnapshot> {
    const entries = await Promise.all(panelFields(definition)
      .filter((field) => field.binding.kind === "credential")
      .map(async (field) => {
        if (field.binding.kind !== "credential") throw new Error("unreachable");
        const state = await this.provider.describe(field.binding.key);
        return [field.id, { configured: state.configured, writable: state.writable }] as const;
      }));
    return { revision: this.revision, fields: Object.fromEntries(entries) };
  }

  async commit(resourceId: string, definition: PanelDefinition, changes: readonly CredentialChange[], expectedRevision: number): Promise<CredentialSnapshot> {
    if (expectedRevision !== this.revision) throw new Error("credential revision conflict");
    for (const change of changes) {
      if (change.field.binding.kind !== "credential" || change.field.type !== "secret") throw new Error("invalid credential route");
      if (!(await this.provider.describe(change.field.binding.key)).writable) throw new Error("credential is read-only");
    }
    let changed = false;
    try {
      for (const change of changes) {
        if (change.field.binding.kind !== "credential") continue;
        if (change.op === "unset") await this.provider.unset(change.field.binding.key);
        else await this.provider.set(change.field.binding.key, change.value);
        changed = true;
      }
    } finally {
      if (changed) this.revision += 1;
    }
    return this.read(resourceId, definition);
  }
}

