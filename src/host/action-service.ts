import { Service, type Context } from "@deepseek-ai/cordis";
import type { ActionHandler, ActionRegistry } from "@linmu/dsh-management-kit/host";

import type { LoaderLike } from "./loader-adapters.js";

export interface PluginActionHandlerResult {
  readonly ok?: boolean;
  readonly message: string;
  readonly restartRequired?: boolean;
}

export type PluginActionHandler = () => Promise<PluginActionHandlerResult>;

declare module "@deepseek-ai/cordis" {
  interface Context {
    resourceManagementActions: ResourceManagementActions;
  }
}

/**
 * Public host seam for a plugin to attach handlers to the declarative action
 * buttons shipped in its own dsh-management/panel.yaml.
 */
export class ResourceManagementActions extends Service {
  constructor(
    ctx: Context,
    private readonly loader: LoaderLike,
    private readonly registry: ActionRegistry,
  ) {
    super(ctx, "resourceManagementActions");
  }

  register(packageName: string, actionId: string, handler: PluginActionHandler): () => void {
    if (packageName.length === 0 || actionId.length === 0) throw new TypeError("packageName and actionId are required");
    const entries = [...this.loader.entries()]
      .filter((entry) => entry.options.group !== true && entry.options.name === packageName);
    if (entries.length === 0) throw new Error(`plugin package is not present in the current loader: ${packageName}`);
    const wrapped: ActionHandler = async () => handler();
    const disposers = [this.registry.register(`plugin:${packageName}`, actionId, wrapped)];
    return () => {
      for (const dispose of disposers.reverse()) dispose();
    };
  }
}
