import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type { SkillSourceAdapter, SkillSourceRecord } from "@linmu/dsh-management-kit/host";
import YAML from "yaml";

const MAX_SKILL_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 4;

export interface DshSkillSummaryLike {
  readonly name: string;
  readonly source: string;
  readonly resourceBase?: { readonly kind: string; readonly path?: string };
}

export interface DshSkillDefinitionLike extends DshSkillSummaryLike {
  readonly description: string;
  readonly content: string;
  readonly path?: string;
}

export interface DshSkillsLike {
  list(): Promise<readonly DshSkillSummaryLike[]>;
  get(name: string): Promise<DshSkillDefinitionLike | undefined>;
}

export interface SkillRoot {
  readonly category: "codex" | "agents" | "other";
  readonly root: string;
  readonly label: string;
}

interface ParsedSkill {
  readonly name: string;
  readonly description: string;
  readonly content: string;
}

function parseSkill(filename: string, text: string): ParsedSkill {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { name: path.basename(path.dirname(filename)), description: "", content: text };
  }
  const normalized = text.replaceAll("\r\n", "\n");
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) return { name: path.basename(path.dirname(filename)), description: "", content: text };
  let metadata: Record<string, unknown> = {};
  try {
    const parsed = YAML.parse(normalized.slice(4, end));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>;
  } catch {
    // An invalid frontmatter block does not make the instruction body unreadable.
  }
  return {
    name: typeof metadata.name === "string" && metadata.name.length > 0
      ? metadata.name
      : path.basename(path.dirname(filename)),
    description: typeof metadata.description === "string" ? metadata.description : "",
    content: normalized.slice(end + 5),
  };
}

async function findSkillFiles(root: string): Promise<string[]> {
  const resolvedRoot = await realpath(root);
  const found: string[] = [];
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) return;
    const entries = await readdir(directory, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name.toLowerCase() === "skill.md")) {
      found.push(path.join(directory, entries.find((entry) => entry.isFile() && entry.name.toLowerCase() === "skill.md")!.name));
      return;
    }
    await Promise.all(entries
      .filter((entry) => entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git")
      .map(async (entry) => {
        const child = await realpath(path.join(directory, entry.name));
        const relative = path.relative(resolvedRoot, child);
        if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
          await visit(child, depth + 1);
        }
      }));
  };
  await visit(resolvedRoot, 0);
  return found;
}

function sourceCategory(source: string): SkillRoot["category"] {
  return source.includes("agents") ? "agents" : source.includes("codex") ? "codex" : "other";
}

/** Combines explicit Codex/Agents roots with the winning public DSH Skill registry view. */
export class FilesystemAndDshSkillSourceAdapter implements SkillSourceAdapter {
  constructor(
    private readonly roots: readonly SkillRoot[],
    private readonly skills?: DshSkillsLike,
  ) {}

  async list(): Promise<readonly SkillSourceRecord[]> {
    const winning = new Map<string, DshSkillDefinitionLike>();
    if (this.skills !== undefined) {
      for (const summary of await this.skills.list()) {
        const definition = await this.skills.get(summary.name);
        if (definition !== undefined) winning.set(summary.name, definition);
      }
    }

    const records: SkillSourceRecord[] = [];
    for (const configured of this.roots) {
      let files: string[];
      try { files = await findSkillFiles(configured.root); } catch { continue; }
      for (const filename of files) {
        if ((await stat(filename)).size > MAX_SKILL_BYTES) continue;
        const root = await realpath(path.dirname(filename));
        const parsed = parseSkill(filename, await readFile(filename, "utf8"));
        const active = winning.get(parsed.name);
        records.push({
          sourceId: `${configured.category}:${configured.label}:${parsed.name}`,
          category: configured.category,
          name: parsed.name,
          description: parsed.description,
          content: parsed.content,
          root,
          active: active?.path === filename || active?.resourceBase?.path === root,
        });
      }
    }

    for (const definition of winning.values()) {
      if (records.some((record) => record.name === definition.name && record.active)) continue;
      if (definition.path === undefined) continue;
      const root = await realpath(path.dirname(definition.path));
      records.push({
        sourceId: `dsh:${definition.source}:${definition.name}`,
        category: sourceCategory(definition.source),
        name: definition.name,
        description: definition.description,
        content: definition.content,
        root,
        active: true,
      });
    }

    const groups = new Map<string, SkillSourceRecord[]>();
    for (const record of records) {
      const group = groups.get(record.name) ?? [];
      group.push(record);
      groups.set(record.name, group);
    }
    return [...groups.values()].flatMap((group) => group.some((record) => record.active)
      ? group
      : group.map((record, index) => ({ ...record, active: index === 0 })));
  }
}
