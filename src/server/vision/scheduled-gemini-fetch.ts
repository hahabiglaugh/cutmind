import { AiProviderError, classifyHttpError } from "./ai-provider-error.ts";
import { GEMINI_REQUEST_TIMEOUT_MS } from "./config.ts";
import { parseGeminiErrorResponse } from "./gemini-error-response.ts";
import { globalGeminiScheduler, type GeminiRequestPriority, type GeminiRequestType, type GeminiSchedulerEvent } from "./gemini-request-scheduler.ts";
import { retryAfterMs } from "./gemini-retry-policy.ts";

export async function scheduledGeminiFetch(fetcher: typeof fetch, url: string, init: RequestInit, options: { type: GeminiRequestType; priority: GeminiRequestPriority; signal?: AbortSignal; onSchedulerEvent?: (event: GeminiSchedulerEvent) => void }) {
  return globalGeminiScheduler.schedule(options.type, options.priority, async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetcher(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        const retryAfter = retryAfterMs(response.headers.get("retry-after")) ?? undefined;
        const summary = await parseGeminiErrorResponse(response, retryAfter);
        const error = classifyHttpError(response.status, summary.googleMessage ?? `Gemini HTTP ${response.status}`) as AiProviderError & { retryAfterMs?: number };
        error.retryAfterMs = retryAfter;
        if (response.status === 429) globalGeminiScheduler.enterRateLimitCooldown(retryAfter);
        console.error("Gemini HTTP error", { requestType: options.type, httpStatus: summary.httpStatus, googleCode: summary.googleCode, googleStatus: summary.googleStatus, message: summary.googleMessage, retryAfterMs: summary.retryAfterMs });
        throw error;
      }
      globalGeminiScheduler.recordSuccess();
      return response;
    } catch (error) {
      if (controller.signal.aborted) throw new AiProviderError("AI_TIMEOUT", `Gemini timed out after ${GEMINI_REQUEST_TIMEOUT_MS}ms`, true);
      throw error;
    } finally { clearTimeout(timeout); }
  }, { signal: options.signal, onEvent: options.onSchedulerEvent });
}
