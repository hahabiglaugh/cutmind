import { GEMINI_BACKOFF_BASE_MS, GEMINI_MAX_ATTEMPTS, GEMINI_MAX_RETRY_AFTER_MS } from "./config.ts";
import { AiProviderError } from "./ai-provider-error.ts";

export interface RetryEvent { state: "attempt" | "retrying"; attempt: number; maxAttempts: number; category?: AiProviderError["code"]; delayMs?: number; model?: string }
export interface RetryDependencies { sleep?: (ms: number) => Promise<void>; random?: () => number }

export function retryAfterMs(value: string | null, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  const parsed = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= GEMINI_MAX_RETRY_AFTER_MS ? parsed : null;
}

export function backoffMs(failedAttempt: number, random = Math.random) {
  const base = GEMINI_BACKOFF_BASE_MS[Math.min(failedAttempt - 1, GEMINI_BACKOFF_BASE_MS.length - 1)];
  return Math.round(base * (0.75 + random() * 0.5));
}

export async function withGeminiRetry<T>(operation: (attempt: number) => Promise<T>, onEvent?: (event: RetryEvent) => void, dependencies: RetryDependencies = {}, maxAttempts = GEMINI_MAX_ATTEMPTS) {
  const sleep = dependencies.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    onEvent?.({ state: "attempt", attempt, maxAttempts });
    try { return await operation(attempt); }
    catch (error) {
      lastError = error;
      if (!(error instanceof AiProviderError) || !error.retryable || attempt === maxAttempts) throw error;
      const delayMs = error.code === "AI_RATE_LIMITED" ? 0 : (error as AiProviderError & { retryAfterMs?: number }).retryAfterMs ?? backoffMs(attempt, dependencies.random);
      onEvent?.({ state: "retrying", attempt: attempt + 1, maxAttempts, category: error.code, delayMs });
      await sleep(delayMs);
    }
  }
  throw lastError;
}
