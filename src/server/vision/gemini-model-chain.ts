import { AiProviderError } from "./ai-provider-error.ts";

export interface ModelChainEvent { state: "switching_model"; model: string; previousModel: string; category: AiProviderError["code"] }

export async function withModelFallback<T>(models: readonly string[], run: (model: string) => Promise<T>, onEvent?: (event: ModelChainEvent) => void, shouldFallback: (error: AiProviderError) => boolean = (error) => error.retryable) {
  let lastError: unknown;
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try { return await run(model); }
    catch (error) {
      lastError = error;
      const nextModel = models[index + 1];
      if (!(error instanceof AiProviderError) || !shouldFallback(error) || !nextModel) throw error;
      onEvent?.({ state: "switching_model", model: nextModel, previousModel: model, category: error.code });
    }
  }
  throw lastError;
}
