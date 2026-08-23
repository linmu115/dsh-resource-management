import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type {
  PluginRegistryMetadata,
  PluginRegistryMetadataAdapter,
  ResourceCategoryConnection,
} from "@linmu/dsh-management-kit/host";
import YAML from "yaml";

interface RegistryPluginRecord {
  readonly name?: unknown;
  readonly classification?: unknown;
  readonly displayName?: unknown;
  readonly description?: unknown;
}

interface RegistryDocument {
  readonly plugins?: unknown;
}

/** Read-only optional bridge to a maintenance registry snapshot; no daemon is required. */
export class FilePluginRegistryMetadataAdapter implements PluginRegistryMetadataAdapter {
  constructor(private readonly filename: string | undefined) {}

  async lookup(packageName: string): Promise<PluginRegistryMetadata | undefined> {
    if (this.filename === undefined) return undefined;
    try {
      if ((await stat(this.filename)).size > 2 * 1024 * 1024) return undefined;
      const parsed = YAML.parse(await readFile(this.filename, "utf8")) as RegistryDocument;
      if (!Array.isArray(parsed.plugins)) return undefined;
      const entry = (parsed.plugins as RegistryPluginRecord[]).find((candidate) => candidate.name === packageName);
      if (entry === undefined) return undefined;
      return {
        category: entry.classification === "homemade" ? "homemade" : "third-party",
        ...(typeof entry.displayName === "string" ? { displayName: entry.displayName } : {}),
        ...(typeof entry.description === "string" ? { description: entry.description } : {}),
      };
    } catch {
      return undefined;
    }
  }
}

export class ConnectedPluginRegistryMetadataAdapter implements PluginRegistryMetadataAdapter {
  constructor(private readonly connection: Promise<ResourceCategoryConnection>) {}

  async lookup(packageName: string): Promise<PluginRegistryMetadata | undefined> {
    try {
      const connection = await this.connection;
      if (!connection.connected || connection.stateRoot === undefined) return undefined;
      return new FilePluginRegistryMetadataAdapter(
        path.join(connection.stateRoot, "registry", "plugins.yaml"),
      ).lookup(packageName);
    } catch {
      return undefined;
    }
  }
}
