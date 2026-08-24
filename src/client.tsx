import { ManagementApp, type ManagementClient } from "@linmu/dsh-management-kit/client";
import "@linmu/dsh-management-kit/theme.css";
import "@linmu/dsh-management-kit/styles.css";

import type { ClientContext, TabComponentProps } from "./context.js";

const API_PATH = "/dsh-resource-management/api";
const PLUGIN_TAB_ID = "dsh-resource-management:plugins";
const SKILL_TAB_ID = "dsh-resource-management:skills";

interface ApiEnvelope<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly error?: { readonly code: string; readonly message: string };
}

export class ManagementApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ManagementApiError";
  }
}

export function createHttpManagementClient(request: typeof fetch = fetch): ManagementClient {
  async function call<T>(method: string, params: unknown): Promise<T> {
    const response = await request(API_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method, params }),
    });
    const body = await response.text();
    if (body.trim().length === 0) {
      throw new ManagementApiError(
        "EMPTY_RESPONSE",
        "DSH 管理连接在返回结果前中断；如果刚执行了重启类操作，请等待 DSH 恢复。",
      );
    }
    let envelope: ApiEnvelope<T>;
    try {
      envelope = JSON.parse(body) as ApiEnvelope<T>;
    } catch {
      throw new ManagementApiError("INVALID_RESPONSE", "DSH 管理服务返回了无法识别的响应");
    }
    if (!response.ok || !envelope.ok) {
      throw new ManagementApiError(envelope.error?.code ?? "REQUEST_FAILED", envelope.error?.message ?? "管理服务不可用");
    }
    return envelope.value as T;
  }

  return {
    list: (kind) => call("list", { kind }),
    detail: (resourceId, sourceId) => call("detail", { resourceId, ...(sourceId === undefined ? {} : { sourceId }) }),
    document: (resourceId, relativePath, sourceId) => call("document", { resourceId, relativePath, ...(sourceId === undefined ? {} : { sourceId }) }),
    panel: (resourceId, sourceId) => call("panel", { resourceId, ...(sourceId === undefined ? {} : { sourceId }) }),
    pluginControl: (resourceId) => call("pluginControl", { resourceId }),
    update: (payload) => call("update", payload),
    save: (payload) => call("save", payload),
    reset: (payload) => call("reset", payload),
    execute: (payload) => call("execute", payload),
    setPluginEnabled: (payload) => call("setPluginEnabled", payload),
    categories: (kind) => call("categories", { kind }),
    mutateCategory: (payload) => call("mutateCategory", payload),
    modelCatalog: () => call("modelCatalog", {}),
  };
}

function PluginManagementPanel(_props: TabComponentProps) {
  return <ManagementApp kind="plugin" client={createHttpManagementClient()} />;
}

function SkillManagementPanel(_props: TabComponentProps) {
  return <ManagementApp kind="skill" client={createHttpManagementClient()} />;
}

export const inject = ["betterSidebar"];

export function apply(ctx: ClientContext): void {
  const registrations = [
    {
      id: PLUGIN_TAB_ID,
      title: "插件管理",
      order: 74,
      component: PluginManagementPanel,
    },
    {
      id: SKILL_TAB_ID,
      title: "Skill 管理",
      order: 75,
      component: SkillManagementPanel,
    },
  ];
  for (const registration of registrations) {
    ctx.effect(() => ctx.betterSidebar.registerTab({
      ...registration,
      single: true,
      createTab: () => ({ tab: { id: registration.id, type: registration.id, title: registration.title } }),
    }), `dsh-resource-management: sidebar tab ${registration.id}`);
  }
}
