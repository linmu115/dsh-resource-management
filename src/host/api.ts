export interface ManagementRequest {
  readonly method: string;
  readonly params?: unknown;
}

export type ManagementResponse =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

export interface ResourceManagementServiceFace {
  readonly list?: (params?: unknown) => Promise<unknown>;
  readonly detail?: (params?: unknown) => Promise<unknown>;
  readonly document?: (params?: unknown) => Promise<unknown>;
  readonly panel?: (params?: unknown) => Promise<unknown>;
  readonly pluginControl?: (params?: unknown) => Promise<unknown>;
  readonly update?: (params?: unknown) => Promise<unknown>;
  readonly save?: (params?: unknown) => Promise<unknown>;
  readonly reset?: (params?: unknown) => Promise<unknown>;
  readonly execute?: (params?: unknown) => Promise<unknown>;
  readonly setPluginEnabled?: (params?: unknown) => Promise<unknown>;
  readonly categories?: (params?: unknown) => Promise<unknown>;
  readonly mutateCategory?: (params?: unknown) => Promise<unknown>;
  readonly modelCatalog?: (params?: unknown) => Promise<unknown>;
}

const allowedMethods = new Set<keyof ResourceManagementServiceFace>([
  "list",
  "detail",
  "document",
  "panel",
  "pluginControl",
  "update",
  "save",
  "reset",
  "execute",
  "setPluginEnabled",
  "categories",
  "mutateCategory",
  "modelCatalog",
]);

function errorCode(reason: unknown): string {
  if (typeof reason === "object" && reason !== null && "code" in reason && typeof reason.code === "string") return reason.code.slice(0, 128);
  return "REQUEST_FAILED";
}

function errorMessage(reason: unknown): string {
  const code = errorCode(reason);
  if ((code.startsWith("CATEGORY_") || code.startsWith("MODEL_CATALOG_"))
    && reason instanceof Error && reason.message.length > 0) return reason.message.slice(0, 512);
  return "资源管理操作失败";
}

export async function dispatchManagementRequest(
  service: ResourceManagementServiceFace,
  request: ManagementRequest,
): Promise<ManagementResponse> {
  if (!allowedMethods.has(request.method as keyof ResourceManagementServiceFace)) {
    return { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "不支持的管理操作" } };
  }
  const handler = service[request.method as keyof ResourceManagementServiceFace];
  if (handler === undefined) return { ok: false, error: { code: "CAPABILITY_UNAVAILABLE", message: "当前环境不提供该操作" } };
  try {
    return { ok: true, value: await handler(request.params) };
  } catch (reason) {
    return { ok: false, error: { code: errorCode(reason), message: errorMessage(reason) } };
  }
}
