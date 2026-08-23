import { AiProviderError, classifyHttpError } from "./ai-provider-error.ts";
import { globalAIRequestScheduler, type AIRequestType } from "./gemini-request-scheduler.ts";
import { QWEN_MAX_ATTEMPTS, QWEN_REQUEST_TIMEOUT_MS, QWEN_VISION_MODEL, qwenChatCompletionsEndpoint } from "./qwen-config.ts";
import type { VisionAnalysisProgressEvent } from "./vision-analysis-provider.ts";

interface QwenResponse { choices?: Array<{ message?: { content?: string } }> }
interface QwenErrorResponse { code?: unknown; message?: unknown; request_id?: unknown; requestId?: unknown }
export interface QwenRequestDiagnostics { onUpstreamStart?: (attempt: number) => void; onUpstreamResponse?: (details: { attempt: number; status: number; errorCode?: string; errorMessage?: string; requestId?: string; retryAfter?: string }) => void; onStage?: (stage: "response_text_parsed" | "json_parsed" | "structured_schema_validated") => void; onJsonShape?: (shape: { type: "object" | "array" | "string" | "null" | "other"; topLevelKeys: string[]; arrayLength?: number; itemKeys?: string[]; hadCodeFence: boolean }) => void }
function safeText(value: unknown, limit = 240) { return typeof value === "string" ? value.replace(/[\r\n]+/g, " ").slice(0, limit) : undefined; }
export function parseQwenJsonContent(content: string) { const trimmed = content.trim(); const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i); const source = fenced ? fenced[1] : trimmed; const value: unknown = JSON.parse(source); const type: "object" | "array" | "string" | "null" | "other" = value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "object" ? "object" : typeof value === "string" ? "string" : "other"; const record = type === "object" ? value as Record<string, unknown> : undefined; const wrappedItems = record && (Array.isArray(record.candidates) ? record.candidates : Array.isArray(record.stories) ? record.stories : undefined); const items = Array.isArray(value) ? value : wrappedItems; const first = items?.[0]; return { value, shape: { type, topLevelKeys: record ? Object.keys(record) : [], arrayLength: items?.length, itemKeys: first && typeof first === "object" && !Array.isArray(first) ? Object.keys(first as Record<string, unknown>) : undefined, hadCodeFence: Boolean(fenced) } }; }
export async function requestQwenJson<T>(options: { apiKey: string; prompt: string; payload: unknown; requestType: AIRequestType; validate: (value: unknown) => T; onProgress?: (event: VisionAnalysisProgressEvent) => void; signal?: AbortSignal; fetcher?: typeof fetch; sleep?: (ms: number) => Promise<void>; diagnostics?: QwenRequestDiagnostics }) {
  const fetcher = options.fetcher ?? fetch; const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))); let repair = false; let lastError: unknown;
  for (let attempt = 1; attempt <= QWEN_MAX_ATTEMPTS; attempt += 1) {
    options.onProgress?.({ state: "attempt", attempt, maxAttempts: QWEN_MAX_ATTEMPTS, model: QWEN_VISION_MODEL });
    try {
      return await globalAIRequestScheduler.schedule(options.requestType, "high", async () => {
        const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), QWEN_REQUEST_TIMEOUT_MS);
        try {
          options.diagnostics?.onUpstreamStart?.(attempt);
          const response = await fetcher(qwenChatCompletionsEndpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` }, signal: controller.signal, body: JSON.stringify({ model: QWEN_VISION_MODEL, messages: [{ role: "system", content: repair ? `${options.prompt}\n上一次 JSON 未通过校验，请修复并只返回完整 JSON。` : options.prompt }, { role: "user", content: JSON.stringify(options.payload) }], response_format: { type: "json_object" }, enable_thinking: false }) });
          if (!response.ok) { let details: QwenErrorResponse = {}; try { details = await response.json() as QwenErrorResponse; } catch { /* Non-JSON upstream error. */ } const errorCode = safeText(details.code); const errorMessage = safeText(details.message); options.diagnostics?.onUpstreamResponse?.({ attempt, status: response.status, errorCode, errorMessage, requestId: safeText(details.request_id ?? details.requestId), retryAfter: safeText(response.headers.get("retry-after")) }); const error = classifyHttpError(response.status, [errorCode, errorMessage].filter(Boolean).join(": ") || `Qwen HTTP ${response.status}`); if (response.status === 429) globalAIRequestScheduler.enterRateLimitCooldown(); throw error; }
          options.diagnostics?.onUpstreamResponse?.({ attempt, status: response.status });
          const payload = await response.json() as QwenResponse; options.diagnostics?.onStage?.("response_text_parsed"); const content = payload.choices?.[0]?.message?.content; if (!content) throw new AiProviderError("PROVIDER_ERROR", "Qwen returned empty JSON", false, response.status);
          let parsed: unknown; try { const result = parseQwenJsonContent(content); parsed = result.value; options.diagnostics?.onJsonShape?.(result.shape); if (process.env.NODE_ENV === "development" && options.requestType === "story_discovery") console.info("Qwen Story JSON shape", result.shape); options.diagnostics?.onStage?.("json_parsed"); } catch { throw new AiProviderError("PROVIDER_ERROR", "Invalid JSON", false, response.status); }
          try { const validated = options.validate(parsed); options.diagnostics?.onStage?.("structured_schema_validated"); return validated; } catch (error) { throw new AiProviderError("PROVIDER_ERROR", error instanceof Error ? error.message : "Invalid Qwen JSON", false, response.status); }
        } catch (error) { if (controller.signal.aborted) throw new AiProviderError("AI_TIMEOUT", `Qwen timed out after ${QWEN_REQUEST_TIMEOUT_MS}ms`, true); throw error; }
        finally { clearTimeout(timeout); }
      }, { signal: options.signal, onEvent: (event) => options.onProgress?.({ ...event, model: QWEN_VISION_MODEL }) });
    } catch (error) {
      lastError = error; const providerError = error instanceof AiProviderError ? error : new AiProviderError("AI_UNAVAILABLE", "Qwen network request failed", true);
      if (providerError.code === "PROVIDER_ERROR" && attempt < QWEN_MAX_ATTEMPTS) { repair = true; continue; }
      if (!providerError.retryable || attempt === QWEN_MAX_ATTEMPTS) throw providerError;
      options.onProgress?.({ state: "retrying", attempt: attempt + 1, maxAttempts: QWEN_MAX_ATTEMPTS, model: QWEN_VISION_MODEL, category: providerError.code, delayMs: 1500 }); await sleep(1500);
    }
  }
  throw lastError;
}
