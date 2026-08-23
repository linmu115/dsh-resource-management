import type {
  PluginControlInventory,
  PluginControlRecord,
  PluginInventoryAdapter,
  PluginInventoryEntryRecord,
  ProfileBundleAdapter,
  ProfileBundleSnapshot,
} from "@linmu/dsh-management-kit/host";

interface LoaderTreeLike {
  write(): void;
}

export interface LoaderEntryLike {
  readonly id: string;
  readonly disabled: boolean;
  readonly fiber?: { readonly state: number };
  readonly parent: { readonly tree: LoaderTreeLike };
  readonly options: {
    readonly id: string;
    readonly name: string;
    readonly group?: boolean | null;
    disabled?: boolean | null;
  };
}

export interface LoaderLike {
  entries(): IterableIterator<LoaderEntryLike>;
  resolve(id: string): LoaderEntryLike | undefined;
}

const fiberPhases: Readonly<Record<number, PluginInventoryEntryRecord["fiberPhase"]>> = {
  0: "pending",
  1: "loading",
  2: "active",
  3: "failed",
  4: null,
  5: "unloading",
};

function pluginEntries(loader: LoaderLike): LoaderEntryLike[] {
  return [...loader.entries()].filter((entry) => entry.options.group !== true);
}

export class LoaderInventoryAdapter implements PluginInventoryAdapter {
  constructor(
    private readonly loader: LoaderLike,
    private readonly profilePackageFile?: string,
  ) {}

  list(): Promise<readonly PluginInventoryEntryRecord[]> {
    return Promise.resolve(pluginEntries(this.loader).map((entry) => ({
      entryId: entry.id,
      moduleName: entry.options.name,
      enabled: !entry.disabled,
      fiberPhase: entry.fiber === undefined ? null : fiberPhases[entry.fiber.state] ?? null,
    })));
  }

  async topLevelPackageNames(): Promise<readonly string[] | undefined> {
    if (this.profilePackageFile === undefined) return undefined;
    let text: string;
    try {
      text = await readFile(this.profilePackageFile, "utf8");
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw reason;
    }
    if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) {
      throw new Error("profile package.json exceeds 2 MiB");
    }
    const parsed = JSON.parse(text) as {
      readonly dependencies?: unknown;
      readonly dsh?: { readonly profile?: { readonly bundles?: unknown } };
    };
    const dependencies = parsed.dependencies !== null && typeof parsed.dependencies === "object" && !Array.isArray(parsed.dependencies)
      ? Object.keys(parsed.dependencies)
      : [];
    const bundles = Array.isArray(parsed.dsh?.profile?.bundles)
      ? parsed.dsh.profile.bundles.filter((value): value is string => typeof value === "string")
      : [];
    return [...new Set([...dependencies, ...bundles].map((name) => name.trim()).filter(Boolean))].sort();
  }
}

export class LoaderPluginControlInventory implements PluginControlInventory {
  constructor(private readonly loader: LoaderLike) {}

  get(resourceId: string): Promise<PluginControlRecord | undefined> {
    if (!resourceId.startsWith("plugin:")) return Promise.resolve(undefined);
    const packageName = resourceId.slice("plugin:".length);
    if (packageName === "dsh-system-components") {
      const systemEntries = pluginEntries(this.loader).filter((entry) => entry.options.name.startsWith("@deepseek-ai/"));
      if (systemEntries.length === 0) return Promise.resolve(undefined);
      return Promise.resolve({
        resourceId,
        packageName: "@deepseek-ai/dsh-base",
        runningEnabled: systemEntries.some((entry) => !entry.disabled),
        mutable: false,
      });
    }
    const entries = pluginEntries(this.loader).filter((entry) => entry.options.name === packageName);
    if (entries.length === 0) return Promise.resolve(undefined);
    return Promise.resolve({
      resourceId,
      packageName,
      runningEnabled: entries.some((entry) => !entry.disabled),
      mutable: !packageName.startsWith("@deepseek-ai/") && packageName !== "dsh-resource-management",
    });
  }
}

export class LoaderProfileBundleAdapter implements ProfileBundleAdapter {
  private revision = 1;

  constructor(private readonly loader: LoaderLike) {}

  read(): Promise<ProfileBundleSnapshot> {
    return Promise.resolve({
      revision: this.revision,
      bundles: [...new Set(pluginEntries(this.loader).filter((entry) => !entry.disabled).map((entry) => entry.options.name))],
    });
  }

  async commit(bundles: readonly string[], expectedRevision: number): Promise<ProfileBundleSnapshot> {
    if (expectedRevision !== this.revision) throw new Error("profile revision conflict");
    if (new Set(bundles).size !== bundles.length) throw new Error("profile bundle list contains duplicates");

    const enabled = new Set(bundles);
    const changed = pluginEntries(this.loader)
      .filter((entry) => entry.disabled === enabled.has(entry.options.name))
      .map((entry) => ({ entry, previous: entry.options.disabled }));
    const trees = [...new Set(changed.map(({ entry }) => entry.parent.tree))];
    try {
      for (const { entry } of changed) entry.options.disabled = !enabled.has(entry.options.name);
      for (const tree of trees) tree.write();
    } catch (error) {
      for (const { entry, previous } of changed) entry.options.disabled = previous;
      for (const tree of trees) {
        try { tree.write(); } catch { /* Preserve the original persistence error. */ }
      }
      throw error;
    }
    this.revision += 1;
    return this.read();
  }
}
import { readFile } from "node:fs/promises";
