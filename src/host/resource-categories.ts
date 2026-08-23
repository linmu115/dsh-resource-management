import type {
  ResourceCategoryMutation,
  ResourceCategoryState,
  ResourceKind,
  ResourceSummary,
} from "@linmu/dsh-management-kit";
import {
  ResourceCategoryError,
  ResourceCategoryService,
  type ResourceCategoryConnection,
  type ResourceCategorySnapshot,
} from "@linmu/dsh-management-kit/host";

export interface ResourceCategoryCatalog {
  list(): Promise<readonly Pick<ResourceSummary, "name" | "systemComponent">[]>;
}

function state(kind: ResourceKind, snapshot: ResourceCategorySnapshot): ResourceCategoryState {
  return {
    kind,
    connected: true,
    readOnly: false,
    revision: snapshot.revision,
    userCategories: snapshot.categories,
    memberships: snapshot.memberships,
    diagnostics: snapshot.diagnostics.map((item) => item.message),
  };
}

function disconnected(kind: ResourceKind, connection: ResourceCategoryConnection): ResourceCategoryState {
  return {
    kind,
    connected: false,
    readOnly: true,
    revision: 0,
    userCategories: [],
    memberships: {},
    diagnostics: [],
    unavailableReason: connection.reason ?? "分类存储未连接",
  };
}

export class ResourceCategories {
  constructor(
    private readonly connection: Promise<ResourceCategoryConnection>,
    private readonly catalogs: Readonly<Record<ResourceKind, ResourceCategoryCatalog>>,
  ) {}

  async snapshot(kind: ResourceKind): Promise<ResourceCategoryState> {
    const connection = await this.connection;
    if (!connection.connected || connection.stateRoot === undefined) return disconnected(kind, connection);
    return state(kind, await new ResourceCategoryService(connection.stateRoot).snapshot(kind));
  }

  async mutate(request: ResourceCategoryMutation): Promise<ResourceCategoryState> {
    const connection = await this.connection;
    if (!connection.connected || connection.stateRoot === undefined) {
      throw new ResourceCategoryError("CATEGORY_CONNECTION_INVALID", connection.reason ?? "分类存储未连接", {
        filePath: connection.connectionPath,
      });
    }
    const service = new ResourceCategoryService(connection.stateRoot);
    let snapshot: ResourceCategorySnapshot;
    switch (request.operation) {
      case "create": {
        if (request.resourceName !== undefined) await this.assertVisible(request.kind, request.resourceName);
        snapshot = await service.create(request.kind, request.name, request.expectedRevision);
        if (request.resourceName !== undefined) {
          const wanted = request.name.normalize("NFKC").trim().toLocaleLowerCase();
          const category = snapshot.categories.find((item) => item.name.normalize("NFKC").trim().toLocaleLowerCase() === wanted);
          if (category === undefined) throw new ResourceCategoryError("CATEGORY_NOT_FOUND", "新建分类无法解析");
          snapshot = await service.assign(request.kind, request.resourceName, category.id, snapshot.revision);
        }
        break;
      }
      case "rename": snapshot = await service.rename(request.kind, request.categoryId, request.name, request.expectedRevision); break;
      case "delete": snapshot = await service.delete(request.kind, request.categoryId, request.expectedRevision); break;
      case "assign":
      case "unassign":
        await this.assertVisible(request.kind, request.resourceName);
        snapshot = request.operation === "assign"
          ? await service.assign(request.kind, request.resourceName, request.categoryId, request.expectedRevision)
          : await service.unassign(request.kind, request.resourceName, request.categoryId, request.expectedRevision);
        break;
      case "reorder": snapshot = await service.reorder(request.kind, request.categoryIds, request.expectedRevision); break;
    }
    return state(request.kind, snapshot);
  }

  private async assertVisible(kind: ResourceKind, name: string): Promise<void> {
    const resource = (await this.catalogs[kind].list()).find((item) => item.name === name);
    if (resource === undefined || (kind === "plugin" && resource.systemComponent === true)) {
      throw new ResourceCategoryError("CATEGORY_RESOURCE_INVALID", `资源不在当前 ${kind} 目录中: ${name}`);
    }
  }
}

