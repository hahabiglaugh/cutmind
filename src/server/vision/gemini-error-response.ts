export interface GeminiErrorSummary {
  httpStatus: number;
  googleCode?: number;
  googleStatus?: string;
  googleMessage?: string;
  retryAfterMs?: number;
}

const sanitize = (value: unknown) => typeof value === "string" ? value.replace(/[?&]key=[^&\s]+/gi, "?key=[redacted]").slice(0, 500) : undefined;

export async function parseGeminiErrorResponse(response: Response, parsedRetryAfterMs?: number): Promise<GeminiErrorSummary> {
  let payload: unknown;
  try { payload = await response.clone().json(); } catch { payload = undefined; }
  const error = payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : undefined;
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return {
    httpStatus: response.status,
    googleCode: typeof record.code === "number" ? record.code : undefined,
    googleStatus: sanitize(record.status),
    googleMessage: sanitize(record.message),
    retryAfterMs: parsedRetryAfterMs,
  };
}
