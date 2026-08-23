import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { Context } from "@deepseek-ai/cordis";
import {
  ActionRegistry,
  PanelRuntime,
  PluginCatalog,
  ProfileControl,
  ResourceCatalog,
  SkillCatalog,
  resolveResourceCategoryConnection,
  type PanelDefinitionAdapter,
} from "@linmu/dsh-management-kit/host";

import { createAssetHttpHandler } from "./host/asset-route.js";
import { ResourceManagementActions } from "./host/action-service.js";
import { createManagementHttpHandler } from "./host/http-route.js";
import {
  LoaderInventoryAdapter,
  LoaderPluginControlInventory,
  LoaderProfileBundleAdapter,
  type LoaderLike,
} from "./host/loader-adapters.js";
import { ConnectedPluginRegistryMetadataAdapter } from "./host/registry-adapter.js";
import { ResourceCategories } from "./host/resource-categories.js";
import {
  DshCredentialAdapter,
  NamespacedJsonPanelPersistenceAdapter,
  NodePluginPackageAdapter,
  type CredentialProviderLike,
} from "./host/runtime-adapters.js";
import {
  FilesystemAndDshSkillSourceAdapter,
  type DshSkillsLike,
  type SkillRoot,
} from "./host/skill-source-adapter.js";
import { parseRuntimeResourceId, ResourceManagementService } from "./host/service.js";

interface WebServerLike {
  register(route: {
    readonly kind: "exact" | "prefix";
    readonly path: string;
    readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  }): () => void;
}

interface HostContext extends Context {
  readonly loader: LoaderLike;
  readonly webServer: WebServerLike;
  readonly credentials: CredentialProviderLike;
  readonly skills: DshSkillsLike;
}

function profileName(): string {
  if (process.env.DSH_PROFILE !== undefined && process.env.DSH_PROFILE.length > 0) return process.env.DSH_PROFILE;
  const index = process.argv.indexOf("--profile");
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1]! : "default";
}

function dshHome(): string {
  return process.env.DSH_HOME ?? path.join(homedir(), ".dsh");
}

function profilePackageFile(): string {
  return path.join(dshHome(), "profiles", profileName(), "package.json");
}

function panelStateFile(): string {
  const profileKey = createHash("sha256").update(profileName()).digest("hex").slice(0, 16);
  return path.join(dshHome(), "plugin-data", "dsh-resource-management", profileKey, "panel-values.json");
}

function skillRoots(): SkillRoot[] {
  return [
    { category: "codex", root: process.env.CODEX_SKILLS_DIR ?? path.join(homedir(), ".codex", "skills"), label: "user" },
    { category: "agents", root: process.env.DSH_AGENTS_SKILLS_DIR ?? path.join(homedir(), ".agents", "skills"), label: "user" },
    { category: "other", root: path.join(dshHome(), "skills"), label: "dsh" },
  ];
}

export const name = "dsh-resource-management";
export const inject = ["loader", "webServer", "credentials", "skills"];

export function apply(ctx: HostContext): void {
  const connection = resolveResourceCategoryConnection({ dshHome: dshHome() });
  const pluginCatalog = new PluginCatalog(
    new LoaderInventoryAdapter(ctx.loader, profilePackageFile()),
    new NodePluginPackageAdapter(ctx.baseUrl ?? import.meta.url),
    new ConnectedPluginRegistryMetadataAdapter(connection),
  );
  const skillCatalog = new SkillCatalog(new FilesystemAndDshSkillSourceAdapter(skillRoots(), ctx.skills));
  const catalog = new ResourceCatalog(pluginCatalog, skillCatalog);

  const definitions: PanelDefinitionAdapter = {
    get: (runtimeResourceId) => {
      const parsed = parseRuntimeResourceId(runtimeResourceId);
      return parsed.resourceId.startsWith("plugin:")
        ? pluginCatalog.definition(parsed.resourceId)
        : skillCatalog.definition(parsed.resourceId, parsed.sourceId);
    },
  };
  const actions = new ActionRegistry();
  new ResourceManagementActions(ctx, ctx.loader, actions);
  const runtime = new PanelRuntime({
    definitions,
    persistence: new NamespacedJsonPanelPersistenceAdapter(panelStateFile()),
    credentials: new DshCredentialAdapter(ctx.credentials),
    actions,
  });
  const control = new ProfileControl(
    new LoaderPluginControlInventory(ctx.loader),
    new LoaderProfileBundleAdapter(ctx.loader),
  );
  const categories = new ResourceCategories(connection, { plugin: pluginCatalog, skill: skillCatalog });
  const service = new ResourceManagementService({ catalog, runtime, control, categories });

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/dsh-resource-management/api",
    handler: createManagementHttpHandler(service),
  }), "dsh-resource-management: API route");
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/dsh-resource-management/assets/",
    handler: createAssetHttpHandler(catalog),
  }), "dsh-resource-management: README assets");
}

export { dispatchManagementRequest } from "./host/api.js";
