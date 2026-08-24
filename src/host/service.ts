import type {
  PanelActionRequest,
  PanelResetRequest,
  PanelSaveRequest,
  PanelUpdateRequest,
  PluginEnableRequest,
  ResourceCategoryMutation,
  ResourceCategoryState,
  ResourceDetail,
  ResourceKind,
  ResourceSummary,
  ModelCatalogView,
} from "@linmu/dsh-management-kit";
import type { PanelDefinition } from "@linmu/dsh-management-kit/contract";
import type { PanelRuntime, ProfileControl, ReadmeAssetAuthorization, ResourceCatalog } from "@linmu/dsh-management-kit/host";

import type { ResourceCategories } from "./resource-categories.js";

export interface ResourceCatalogFace extends Pick<ResourceCatalog, "list" | "detail" | "document" | "definition" | "authorizeAsset"> {}

export interface CategoryServiceFace {
  snapshot(kind: ResourceKind): Promise<ResourceCategoryState>;
  mutate(request: ResourceCategoryMutation): Promise<ResourceCategoryState>;
}

export interface CategoryChannel {
  snapshot(): Promise<ResourceCategoryState>;
  mutate(request: ResourceCategoryMutation): Promise<ResourceCategoryState>;
}

export interface CategoryChannels {
  readonly plugin: CategoryChannel;
  readonly skill: CategoryChannel;
}

interface ServiceDependencies {
  readonly catalog: ResourceCatalogFace;
  readonly runtime: PanelRuntime;
  readonly control: ProfileControl;
  readonly categories: CategoryServiceFace | CategoryChannels;
  readonly models?: { list(): Promise<ModelCatalogView> };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("request params must be an object");
  return value as Record<string, unknown>;
}

function kind(value: unknown): ResourceKind {
  if (value === "plugin" || value === "skill") return value;
  throw new TypeError("invalid resource kind");
}

function resourceId(value: unknown, expected?: ResourceKind): string {
  if (typeof value !== "string") throw new TypeError("invalid resource id");
  const prefix = expected === "plugin" ? "plugin:" : expected === "skill" ? "skill:" : "";
  if (prefix && !value.startsWith(prefix)) throw new TypeError(`invalid ${expected} resource id`);
  if (!prefix && !value.startsWith("plugin:") && !value.startsWith("skill:")) throw new TypeError("invalid resource id");
  return value;
}

function selectedSource(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) throw new TypeError("invalid Skill source id");
  return value;
}

export function runtimeSkillResourceId(baseResourceId: string, sourceId: string): string {
  return `${baseResourceId}|source=${encodeURIComponent(sourceId)}`;
}

export function parseRuntimeResourceId(value: string): { readonly resourceId: string; readonly sourceId?: string } {
  const marker = "|source=";
  const index = value.indexOf(marker);
  if (index < 0) return { resourceId: value };
  return { resourceId: value.slice(0, index), sourceId: decodeURIComponent(value.slice(index + marker.length)) };
}

function validateRuntimeResourceId(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("invalid runtime resource id");
  const parsed = parseRuntimeResourceId(value);
  resourceId(parsed.resourceId);
  if (parsed.resourceId.startsWith("plugin:") && parsed.sourceId !== undefined) throw new TypeError("Plugin resource cannot select a Skill source");
  return value;
}

export class ResourceManagementService {
  private readonly catalog: ResourceCatalogFace;
  private readonly runtime: PanelRuntime;
  private readonly control: ProfileControl;
  private readonly categoryService: CategoryServiceFace;
  private readonly models?: { list(): Promise<ModelCatalogView> };

  constructor(dependencies: ServiceDependencies | {
    readonly catalog: ResourceCatalogFace;
    readonly runtime: PanelRuntime;
    readonly control: ProfileControl;
    readonly categories: ResourceCategories | CategoryServiceFace;
    readonly models?: { list(): Promise<ModelCatalogView> };
  }) {
    this.catalog = dependencies.catalog;
    this.runtime = dependencies.runtime;
    this.control = dependencies.control;
    this.models = dependencies.models;
    const categoryDependency = dependencies.categories;
    this.categoryService = "plugin" in categoryDependency && "skill" in categoryDependency
      ? {
        snapshot: (kind: ResourceKind) => categoryDependency[kind].snapshot(),
        mutate: (request: ResourceCategoryMutation) => categoryDependency[request.kind].mutate(request),
      }
      : categoryDependency;
  }

  list = async (params: unknown): Promise<readonly ResourceSummary[]> => {
    const input = record(params);
    return this.catalog.list(kind(input.kind));
  };

  detail = async (params: unknown): Promise<ResourceDetail> => {
    const input = record(params);
    const id = resourceId(input.resourceId);
    return this.catalog.detail(id, selectedSource(input.sourceId));
  };

  document = async (params: unknown) => {
    const input = record(params);
    const relativePath = input.relativePath;
    if (typeof relativePath !== "string" || relativePath.length === 0 || relativePath.length > 4096) throw new TypeError("invalid document path");
    const id = resourceId(input.resourceId);
    return this.catalog.document(id, relativePath, selectedSource(input.sourceId));
  };

  panel = async (params: unknown) => {
    const input = record(params);
    const id = resourceId(input.resourceId);
    const sourceId = selectedSource(input.sourceId);
    if (await this.catalog.definition(id, sourceId) === undefined) return undefined;
    return this.runtime.describe(sourceId === undefined ? id : runtimeSkillResourceId(id, sourceId));
  };

  pluginControl = async (params: unknown) => {
    const input = record(params);
    const state = await this.control.state(resourceId(input.resourceId, "plugin"));
    return {
      enabled: state.enabled,
      runningEnabled: state.runningEnabled,
      pending: state.pending,
      mutable: state.mutable,
      revision: state.revision,
    };
  };

  update = async (params: unknown) => {
    const input = record(params);
    validateRuntimeResourceId(input.resourceId);
    return this.runtime.update(input as unknown as PanelUpdateRequest);
  };
  save = async (params: unknown) => {
    const input = record(params);
    validateRuntimeResourceId(input.resourceId);
    return this.runtime.save(input as unknown as PanelSaveRequest);
  };
  reset = async (params: unknown) => {
    const input = record(params);
    validateRuntimeResourceId(input.resourceId);
    return this.runtime.reset(input as unknown as PanelResetRequest);
  };
  execute = async (params: unknown) => {
    const input = record(params);
    validateRuntimeResourceId(input.resourceId);
    return this.runtime.execute(input as unknown as PanelActionRequest);
  };

  setPluginEnabled = async (params: unknown) => {
    const input = record(params);
    const request = record(input) as unknown as PluginEnableRequest;
    resourceId(request.resourceId, "plugin");
    return this.control.setEnabled(request);
  };

  categories = async (params: unknown): Promise<ResourceCategoryState> => this.categoryService.snapshot(kind(record(params).kind));
  mutateCategory = (params: unknown): Promise<ResourceCategoryState> => this.categoryService.mutate(record(params) as unknown as ResourceCategoryMutation);
  modelCatalog = async (): Promise<ModelCatalogView> => {
    if (this.models === undefined) throw Object.assign(new Error("模型目录不可用"), { code: "MODEL_CATALOG_UNAVAILABLE" });
    return this.models.list();
  };

  authorizeAsset = async (params: unknown): Promise<ReadmeAssetAuthorization> => {
    const input = record(params);
    if (typeof input.assetBaseUrl !== "string" || typeof input.relativePath !== "string") throw new TypeError("invalid asset request");
    return this.catalog.authorizeAsset(input.assetBaseUrl, input.relativePath);
  };
}

export type { PanelDefinition };
