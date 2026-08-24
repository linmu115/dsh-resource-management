import { readFile } from "node:fs/promises";
import path from "node:path";

import { parsePanelDocument } from "@linmu/dsh-management-kit/contract";
import { describe, expect, it } from "vitest";

import { FilesystemAndDshSkillSourceAdapter } from "../src/host/skill-source-adapter.js";

const root = process.cwd();
const skillRoot = path.join(root, "skills", "dsh-management-panel-builder");

describe("bundled panel-builder Skill", () => {
  it("is declared by both the npm package and Codex plugin manifest", async () => {
    const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      version: string;
      files: string[];
    };
    const pluginJson = JSON.parse(await readFile(path.join(root, ".codex-plugin", "plugin.json"), "utf8")) as {
      version: string;
      skills: string;
    };

    expect(packageJson.files).toEqual(expect.arrayContaining([".codex-plugin", "skills"]));
    expect(pluginJson.skills).toBe("./skills/");
    expect(pluginJson.version).toBe(packageJson.version);
  });

  it("is discoverable by the Manager Skill catalog and ships a valid Contract v2 template", async () => {
    const adapter = new FilesystemAndDshSkillSourceAdapter([
      { category: "other", root: path.join(root, "skills"), label: "bundled" },
    ]);
    const records = await adapter.list();
    const template = await readFile(path.join(skillRoot, "assets", "dsh-management", "panel.yaml"), "utf8");

    expect(records).toEqual([
      expect.objectContaining({
        sourceId: "other:bundled:dsh-management-panel-builder",
        name: "dsh-management-panel-builder",
        active: true,
      }),
    ]);
    expect(parsePanelDocument(template)).toMatchObject({
      contractVersion: 2,
      sections: expect.arrayContaining([expect.objectContaining({ id: "general" })]),
      actions: [expect.objectContaining({ id: "cache.clear", style: "danger" })],
    });
  });
});
