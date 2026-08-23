import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  exportLegacyPanelValues,
  migrateLegacyPanelValues,
  type PanelValuePaths,
} from "../src/host/panel-migration.js";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture(): Promise<PanelValuePaths> {
  const actualRoot = await mkdtemp(path.join(os.tmpdir(), "dsh-panel-migration-"));
  temporary.push(actualRoot);
  return {
    unified: path.join(actualRoot, "dsh-resource-management", "profile", "panel-values.json"),
    legacyPlugin: path.join(actualRoot, "dsh-plugin-management", "profile", "panel-values.json"),
    legacySkill: path.join(actualRoot, "dsh-skill-management", "profile", "panel-values.json"),
  };
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function json(filename: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(filename, "utf8")) as Record<string, unknown>;
}

async function exists(filename: string): Promise<boolean> {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

const stored = (type: string, value: unknown) => ({ type, value });

describe("legacy panel value migration", () => {
  it("migrates Plugin-only state and removes the verified legacy file", async () => {
    const paths = await fixture();
    await writeJson(paths.legacyPlugin, {
      revision: 3,
      resources: { "plugin:sidechat": { enabled: stored("switch", true) } },
    });

    await expect(migrateLegacyPanelValues(paths)).resolves.toMatchObject({
      status: "migrated",
      importedPluginFields: 1,
      importedSkillFields: 0,
    });
    await expect(json(paths.unified)).resolves.toMatchObject({
      schemaVersion: 1,
      migrationVersion: 1,
      plugins: { "plugin:sidechat": { enabled: stored("switch", true) } },
      skills: {},
    });
    expect(await exists(paths.legacyPlugin)).toBe(false);
  });

  it("migrates Skill-only state into the separate namespace", async () => {
    const paths = await fixture();
    await writeJson(paths.legacySkill, {
      revision: 2,
      resources: { "skill:notes|source=codex": { style: stored("select", "compact") } },
    });

    const result = await migrateLegacyPanelValues(paths);
    expect(result.importedSkillFields).toBe(1);
    await expect(json(paths.unified)).resolves.toMatchObject({
      plugins: {},
      skills: { "skill:notes|source=codex": { style: stored("select", "compact") } },
    });
  });

  it("preserves newer unified values and imports only missing old fields from both managers", async () => {
    const paths = await fixture();
    await writeJson(paths.unified, {
      schemaVersion: 1,
      revision: 7,
      plugins: { "plugin:sidechat": { enabled: stored("switch", false) } },
      skills: {},
    });
    await writeJson(paths.legacyPlugin, {
      revision: 3,
      resources: { "plugin:sidechat": { enabled: stored("switch", true), color: stored("text", "red") } },
    });
    await writeJson(paths.legacySkill, {
      revision: 1,
      resources: { "skill:notes": { folder: stored("path", "notes") } },
    });

    await migrateLegacyPanelValues(paths);
    await expect(json(paths.unified)).resolves.toMatchObject({
      revision: 8,
      plugins: { "plugin:sidechat": { enabled: stored("switch", false), color: stored("text", "red") } },
      skills: { "skill:notes": { folder: stored("path", "notes") } },
    });
  });

  it("does nothing when neither legacy document exists", async () => {
    const paths = await fixture();
    await expect(migrateLegacyPanelValues(paths)).resolves.toMatchObject({ status: "noop" });
    expect(await exists(paths.unified)).toBe(false);
  });

  it("rejects invalid legacy data without changing or deleting any file", async () => {
    const paths = await fixture();
    const original = { schemaVersion: 1, revision: 4, plugins: {}, skills: {} };
    await writeJson(paths.unified, original);
    await writeJson(paths.legacyPlugin, {
      revision: 1,
      resources: { "plugin:sidechat": { enabled: stored("switch", "not-a-boolean") } },
    });

    await expect(migrateLegacyPanelValues(paths)).rejects.toThrow(/legacy Plugin/i);
    expect(await json(paths.unified)).toEqual(original);
    expect(await exists(paths.legacyPlugin)).toBe(true);
  });

  it("serializes concurrent migrations with a profile-scoped lock", async () => {
    const paths = await fixture();
    await writeJson(paths.legacyPlugin, {
      revision: 1,
      resources: { "plugin:one": { enabled: stored("switch", true) } },
    });

    const results = await Promise.all([
      migrateLegacyPanelValues(paths),
      migrateLegacyPanelValues(paths),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["migrated", "noop"]);
    await expect(json(paths.unified)).resolves.toMatchObject({
      plugins: { "plugin:one": { enabled: stored("switch", true) } },
    });
  });

  it("retains all legacy files when atomic replacement fails", async () => {
    const paths = await fixture();
    await writeJson(paths.legacyPlugin, {
      revision: 1,
      resources: { "plugin:one": { enabled: stored("switch", true) } },
    });
    const replaceFile = vi.fn(async () => { throw new Error("simulated replacement failure"); });

    await expect(migrateLegacyPanelValues(paths, { replaceFile })).rejects.toThrow(/replacement failure/i);
    expect(await exists(paths.legacyPlugin)).toBe(true);
    expect(await exists(paths.unified)).toBe(false);
  });

  it("exports exact old-format documents for rollback", async () => {
    const paths = await fixture();
    await writeJson(paths.unified, {
      schemaVersion: 1,
      migrationVersion: 1,
      revision: 9,
      plugins: { "plugin:one": { enabled: stored("switch", true) } },
      skills: { "skill:one": { mode: stored("select", "review") } },
    });
    const exportPaths: PanelValuePaths = {
      ...paths,
      legacyPlugin: path.join(path.dirname(paths.legacyPlugin), "rollback", "panel-values.json"),
      legacySkill: path.join(path.dirname(paths.legacySkill), "rollback", "panel-values.json"),
    };

    await expect(exportLegacyPanelValues(exportPaths)).resolves.toMatchObject({
      exportedPluginFields: 1,
      exportedSkillFields: 1,
    });
    expect(await json(exportPaths.legacyPlugin)).toEqual({
      revision: 9,
      resources: { "plugin:one": { enabled: stored("switch", true) } },
    });
    expect(await json(exportPaths.legacySkill)).toEqual({
      revision: 9,
      resources: { "skill:one": { mode: stored("select", "review") } },
    });
  });
});
