import { describe, expect, it } from "vitest";

import { DshModelCatalogAdapter } from "../src/host/model-catalog.js";

describe("DSH model catalog adapter", () => {
  it("detaches provider, model and reasoning metadata for the Manager selector", async () => {
    const adapter = new DshModelCatalogAdapter(() => ({
      listProviders: () => [{ id: "deepseek", name: "DeepSeek" }],
      listModels: async () => [{ provider: "deepseek", id: "deepseek-v4", name: "DeepSeek V4" }],
      resolveModelInfo: async () => ({
        provider: "deepseek",
        id: "deepseek-v4",
        name: "DeepSeek V4",
        reasoning: {
          efforts: [{ id: "high", name: "High" }],
          defaultEffort: "high",
        },
      }),
    } as never));
    await expect(adapter.list()).resolves.toEqual({
      entries: [{
        provider: "deepseek",
        providerName: "DeepSeek",
        model: "deepseek-v4",
        modelName: "DeepSeek V4",
        efforts: [{ id: "high", name: "High" }],
        defaultEffort: "high",
      }],
      failures: [],
    });
  });
});
