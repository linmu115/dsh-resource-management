import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rmdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const LOCK_STALE_MS = 2 * 60 * 1000;
const LOCK_WAIT_MS = 10_000;
const LOCK_RETRY_MS = 20;
const FIELD_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STORED_TYPES = new Set(["switch", "text", "number", "slider", "select", "multiselect", "path", "secret"]);

interface StoredValue {
  readonly type: string;
  readonly value: unknown;
}

type ResourceValues = Record<string, Record<string, StoredValue>>;

interface LegacyValueDocument {
  readonly revision: number;
  readonly resources: ResourceValues;
}

interface UnifiedValueDocument {
  readonly schemaVersion: 1;
  readonly migrationVersion?: 1;
  readonly revision: number;
  readonly plugins: ResourceValues;
  readonly skills: ResourceValues;
}

export interface PanelValuePaths {
  readonly unified: string;
  readonly legacyPlugin: string;
  readonly legacySkill: string;
  readonly lockDirectory?: string;
}

export interface PanelMigrationOperations {
  readonly replaceFile?: (temporary: string, destination: string) => Promise<void>;
}

export interface PanelMigrationResult {
  readonly status: "noop" | "migrated";
  readonly importedPluginFields: number;
  readonly importedSkillFields: number;
  readonly verifiedDigest?: string;
  readonly deletedLegacyFiles: number;
}

export interface PanelExportResult {
  readonly exportedPluginFields: number;
  readonly exportedSkillFields: number;
  readonly unifiedDigest: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function validStoredValue(value: unknown): value is StoredValue {
  if (!isRecord(value) || !exactKeys(value, ["type", "value"]) || typeof value.type !== "string" || !STORED_TYPES.has(value.type)) {
    return false;
  }
  switch (value.type) {
    case "switch": return typeof value.value === "boolean";
    case "number":
    case "slider": return typeof value.value === "number" && Number.isFinite(value.value);
    case "multiselect": return Array.isArray(value.value)
      && value.value.length <= 256
      && value.value.every((entry) => typeof entry === "string" && entry.length <= 256);
    case "select": return typeof value.value === "string" && value.value.length <= 256;
    case "path": return typeof value.value === "string" && value.value.length <= 32_768;
    case "text":
    case "secret": return typeof value.value === "string" && value.value.length <= 65_536;
    default: return false;
  }
}

function validResources(value: unknown, prefix: "plugin:" | "skill:"): value is ResourceValues {
  if (!isRecord(value)) return false;
  for (const [resourceId, fields] of Object.entries(value)) {
    if (!resourceId.startsWith(prefix) || resourceId.length <= prefix.length || resourceId.length > 4096 || !isRecord(fields)) return false;
    for (const [fieldId, storedValue] of Object.entries(fields)) {
      if (!FIELD_ID.test(fieldId) || !validStoredValue(storedValue)) return false;
    }
  }
  return true;
}

function parseLegacy(value: unknown, prefix: "plugin:" | "skill:", label: string): LegacyValueDocument {
  if (!isRecord(value)
    || !exactKeys(value, ["revision", "resources"])
    || !Number.isInteger(value.revision)
    || (value.revision as number) < 0
    || !validResources(value.resources, prefix)) {
    throw new Error(`invalid legacy ${label} panel value document`);
  }
  return value as unknown as LegacyValueDocument;
}

function parseUnified(value: unknown): UnifiedValueDocument {
  if (!isRecord(value)
    || !exactKeys(value, ["schemaVersion", "migrationVersion", "revision", "plugins", "skills"])
    || value.schemaVersion !== 1
    || (value.migrationVersion !== undefined && value.migrationVersion !== 1)
    || !Number.isInteger(value.revision)
    || (value.revision as number) < 0
    || !validResources(value.plugins, "plugin:")
    || !validResources(value.skills, "skill:")) {
    throw new Error("invalid unified panel value document");
  }
  return value as unknown as UnifiedValueDocument;
}

function emptyUnified(): UnifiedValueDocument {
  return { schemaVersion: 1, revision: 0, plugins: {}, skills: {} };
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

async function readOptionalJson(filename: string): Promise<unknown | undefined> {
  try {
    const info = await stat(filename);
    if (!info.isFile()) throw new Error("panel value path is not a file");
    if (info.size > MAX_DOCUMENT_BYTES) throw new Error("panel value document exceeds 2 MiB");
    return JSON.parse(await readFile(filename, "utf8")) as unknown;
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

function cloneResources(value: ResourceValues): ResourceValues {
  return structuredClone(value) as ResourceValues;
}

function mergeMissing(target: ResourceValues, source: ResourceValues): number {
  let imported = 0;
  for (const [resourceId, sourceFields] of Object.entries(source)) {
    const targetFields = target[resourceId] ?? {};
    target[resourceId] = targetFields;
    for (const [fieldId, storedValue] of Object.entries(sourceFields)) {
      if (Object.hasOwn(targetFields, fieldId)) continue;
      targetFields[fieldId] = structuredClone(storedValue) as StoredValue;
      imported += 1;
    }
  }
  return imported;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function fieldCount(resources: ResourceValues): number {
  return Object.values(resources).reduce((total, fields) => total + Object.keys(fields).length, 0);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function acquireLock(lockDirectory: string): Promise<() => Promise<void>> {
  const started = Date.now();
  await mkdir(path.dirname(lockDirectory), { recursive: true });
  while (true) {
    try {
      await mkdir(lockDirectory);
      return async () => {
        try { await rmdir(lockDirectory); } catch (error) { if (!isMissing(error)) throw error; }
      };
    } catch (error) {
      if (!isRecord(error) || error.code !== "EEXIST") throw error;
      try {
        const info = await stat(lockDirectory);
        if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
          await rmdir(lockDirectory);
          continue;
        }
      } catch (lockError) {
        if (isMissing(lockError)) continue;
        throw lockError;
      }
      if (Date.now() - started > LOCK_WAIT_MS) throw new Error("timed out waiting for panel migration lock");
      await delay(LOCK_RETRY_MS);
    }
  }
}

async function writeAtomic(
  filename: string,
  value: unknown,
  replaceFile: (temporary: string, destination: string) => Promise<void>,
): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${String(process.pid)}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await replaceFile(temporary, filename);
  } finally {
    try { await unlink(temporary); } catch (error) { if (!isMissing(error)) throw error; }
  }
}

async function deleteVerifiedLegacy(filename: string): Promise<boolean> {
  try {
    await unlink(filename);
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
  try { await rmdir(path.dirname(filename)); } catch (error) {
    if (!isRecord(error) || (error.code !== "ENOENT" && error.code !== "ENOTEMPTY" && error.code !== "EEXIST")) throw error;
  }
  return true;
}

function lockPath(paths: PanelValuePaths): string {
  return paths.lockDirectory ?? `${paths.unified}.migration.lock`;
}

export async function migrateLegacyPanelValues(
  paths: PanelValuePaths,
  operations: PanelMigrationOperations = {},
): Promise<PanelMigrationResult> {
  const release = await acquireLock(lockPath(paths));
  try {
    const [legacyPluginRaw, legacySkillRaw] = await Promise.all([
      readOptionalJson(paths.legacyPlugin),
      readOptionalJson(paths.legacySkill),
    ]);
    if (legacyPluginRaw === undefined && legacySkillRaw === undefined) {
      return { status: "noop", importedPluginFields: 0, importedSkillFields: 0, deletedLegacyFiles: 0 };
    }

    const legacyPlugin = legacyPluginRaw === undefined ? undefined : parseLegacy(legacyPluginRaw, "plugin:", "Plugin");
    const legacySkill = legacySkillRaw === undefined ? undefined : parseLegacy(legacySkillRaw, "skill:", "Skill");
    const unifiedRaw = await readOptionalJson(paths.unified);
    const current = unifiedRaw === undefined ? emptyUnified() : parseUnified(unifiedRaw);
    const plugins = cloneResources(current.plugins);
    const skills = cloneResources(current.skills);
    const importedPluginFields = legacyPlugin === undefined ? 0 : mergeMissing(plugins, legacyPlugin.resources);
    const importedSkillFields = legacySkill === undefined ? 0 : mergeMissing(skills, legacySkill.resources);
    const next: UnifiedValueDocument = {
      schemaVersion: 1,
      migrationVersion: 1,
      revision: current.revision + 1,
      plugins,
      skills,
    };

    await writeAtomic(paths.unified, next, operations.replaceFile ?? rename);
    const verified = parseUnified(await readOptionalJson(paths.unified));
    const expectedDigest = digest(next);
    if (digest(verified) !== expectedDigest
      || fieldCount(verified.plugins) !== fieldCount(next.plugins)
      || fieldCount(verified.skills) !== fieldCount(next.skills)) {
      throw new Error("unified panel migration verification failed");
    }

    const deleted = await Promise.all([
      legacyPlugin === undefined ? false : deleteVerifiedLegacy(paths.legacyPlugin),
      legacySkill === undefined ? false : deleteVerifiedLegacy(paths.legacySkill),
    ]);
    return {
      status: "migrated",
      importedPluginFields,
      importedSkillFields,
      verifiedDigest: expectedDigest,
      deletedLegacyFiles: deleted.filter(Boolean).length,
    };
  } finally {
    await release();
  }
}

export async function exportLegacyPanelValues(
  paths: PanelValuePaths,
  operations: PanelMigrationOperations = {},
): Promise<PanelExportResult> {
  const release = await acquireLock(lockPath(paths));
  try {
    const raw = await readOptionalJson(paths.unified);
    if (raw === undefined) throw new Error("unified panel value document does not exist");
    const unified = parseUnified(raw);
    const pluginDocument: LegacyValueDocument = { revision: unified.revision, resources: cloneResources(unified.plugins) };
    const skillDocument: LegacyValueDocument = { revision: unified.revision, resources: cloneResources(unified.skills) };
    const replaceFile = operations.replaceFile ?? rename;
    await writeAtomic(paths.legacyPlugin, pluginDocument, replaceFile);
    await writeAtomic(paths.legacySkill, skillDocument, replaceFile);
    const [verifiedPlugin, verifiedSkill] = await Promise.all([
      readOptionalJson(paths.legacyPlugin).then((value) => parseLegacy(value, "plugin:", "Plugin")),
      readOptionalJson(paths.legacySkill).then((value) => parseLegacy(value, "skill:", "Skill")),
    ]);
    if (digest(verifiedPlugin) !== digest(pluginDocument) || digest(verifiedSkill) !== digest(skillDocument)) {
      throw new Error("legacy panel export verification failed");
    }
    return {
      exportedPluginFields: fieldCount(verifiedPlugin.resources),
      exportedSkillFields: fieldCount(verifiedSkill.resources),
      unifiedDigest: digest(unified),
    };
  } finally {
    await release();
  }
}
