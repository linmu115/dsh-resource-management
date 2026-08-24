import type { LlmRuntime } from "@deepseek-ai/dsh-llm";
import type { ModelCatalogView } from "@linmu/dsh-management-kit";

type LlmCatalogFace = Pick<LlmRuntime, "listProviders" | "listModels" | "resolveModelInfo">;

export class DshModelCatalogAdapter {
  constructor(private readonly runtime: () => LlmCatalogFace | undefined) {}

  async list(): Promise<ModelCatalogView> {
    const runtime = this.runtime();
    if (runtime === undefined) throw Object.assign(new Error("DSH LLM runtime is unavailable"), { code: "MODEL_CATALOG_UNAVAILABLE" });
    const entries: ModelCatalogView["entries"][number][] = [];
    const failures: ModelCatalogView["failures"][number][] = [];
    for (const provider of runtime.listProviders()) {
      try {
        const models = await runtime.listModels(provider.id);
        for (const model of models) {
          try {
            const resolved = await runtime.resolveModelInfo(provider.id, model.id);
            entries.push({
              provider: provider.id,
              providerName: provider.name,
              model: model.id,
              modelName: model.name,
              ...(model.description === undefined ? {} : { description: model.description }),
              efforts: (resolved.reasoning?.efforts ?? []).map((effort) => ({
                id: String(effort.id),
                name: effort.name,
                ...(effort.description === undefined ? {} : { description: effort.description }),
              })),
              ...(resolved.reasoning?.defaultEffort === undefined
                ? {}
                : { defaultEffort: String(resolved.reasoning.defaultEffort) }),
            });
          } catch (reason) {
            failures.push({ provider: `${provider.id}/${model.id}`, message: reason instanceof Error ? reason.message : String(reason) });
          }
        }
      } catch (reason) {
        failures.push({ provider: provider.id, message: reason instanceof Error ? reason.message : String(reason) });
      }
    }
    return { entries, failures };
  }
}
