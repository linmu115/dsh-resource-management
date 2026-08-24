import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-llm";
import type {} from "@deepseek-ai/dsh-settings";
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
import { migrateLegacyPanelValues, type PanelValuePaths } from "./host/panel-migration.js";
import { ResourceManagementActions } from "./host/action-service.js";
import { createManagementHttpHandler } from "./host/http-route.js";
import {
  LoaderInventoryAdapter,
  LoaderPluginControlInventory,
  LoaderProfileBundleAdapter,
  type LoaderLike,
} from "./host/loader-adapters.js";
import { ConnectedPluginRegistryMetadataAdapter } from "./host/registry-adapter.js";
import { ResponseCompletionScheduler } from "./host/response-completion.js";
import { ResourceCategories } from "./host/resource-categories.js";
import { DshModelCatalogAdapter } from "./host/model-catalog.js";
import { DshSettingsPanelAdapter } from "./host/settings-adapter.js";
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

function panelValuePaths(): PanelValuePaths {
  const profileKey = createHash("sha256").update(profileName()).digest("hex").slice(0, 16);
  const root = path.join(dshHome(), "plugin-data");
  return {
    unified: path.join(root, "dsh-resource-management", profileKey, "panel-values.json"),
    legacyPlugin: path.join(root, "dsh-plugin-management", profileKey, "panel-values.json"),
    legacySkill: path.join(root, "dsh-skill-management", profileKey, "panel-values.json"),
  };
}

function skillRoots(): SkillRoot[] {
  return [
    {
      category: "other",
      root: fileURLToPath(new URL("../skills", import.meta.url)),
      label: "bundled",
    },
    { category: "codex", root: process.env.CODEX_SKILLS_DIR ?? path.join(homedir(), ".codex", "skills"), label: "user" },
    { category: "agents", root: process.env.DSH_AGENTS_SKILLS_DIR ?? path.join(homedir(), ".agents", "skills"), label: "user" },
    { category: "other", root: path.join(dshHome(), "skills"), label: "dsh" },
  ];
}

export const name = "dsh-resource-management";
export const inject = ["loader", "webServer", "credentials", "skills"];

export async function apply(ctx: HostContext): Promise<void> {
  const valuePaths = panelValuePaths();
  await migrateLegacyPanelValues(valuePaths);
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
  const responseCompletion = new ResponseCompletionScheduler();
  new ResourceManagementActions(ctx, ctx.loader, actions, responseCompletion);
  const runtime = new PanelRuntime({
    definitions,
    persistence: new NamespacedJsonPanelPersistenceAdapter(valuePaths.unified),
    settings: new DshSettingsPanelAdapter(() => ctx.get("settings")),
    credentials: new DshCredentialAdapter(ctx.credentials),
    actions,
  });
  const control = new ProfileControl(
    new LoaderPluginControlInventory(ctx.loader),
    new LoaderProfileBundleAdapter(ctx.loader),
  );
  const categories = new ResourceCategories(connection, { plugin: pluginCatalog, skill: skillCatalog });
  const models = new DshModelCatalogAdapter(() => ctx.get("llm"));
  const service = new ResourceManagementService({ catalog, runtime, control, categories, models });

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/dsh-resource-management/api",
    handler: createManagementHttpHandler(service, responseCompletion),
  }), "dsh-resource-management: API route");
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/dsh-resource-management/assets/",
    handler: createAssetHttpHandler(catalog),
  }), "dsh-resource-management: README assets");
}

export { dispatchManagementRequest } from "./host/api.js";
export {
  exportLegacyPanelValues,
  migrateLegacyPanelValues,
  type PanelExportResult,
  type PanelMigrationOperations,
  type PanelMigrationResult,
  type PanelValuePaths,
} from "./host/panel-migration.js";
