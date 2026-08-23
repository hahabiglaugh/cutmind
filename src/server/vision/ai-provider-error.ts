export type AiErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "AI_UNAVAILABLE"
  | "AI_AUTH_ERROR"
  | "AI_BAD_REQUEST"
  | "PROVIDER_ERROR";

export class AiProviderError extends Error {
  readonly code: AiErrorCode;
  readonly retryable: boolean;
  readonly httpStatus?: number;
  constructor(
    code: AiErrorCode,
    message: string,
    retryable: boolean,
    httpStatus?: number,
  ) { super(message); this.name = "AiProviderError"; this.code = code; this.retryable = retryable; this.httpStatus = httpStatus; }
}

export function classifyHttpError(status: number, message = "Gemini request failed") {
  if (status === 429) return new AiProviderError("AI_RATE_LIMITED", message, true, status);
  if ([500, 502, 503, 504].includes(status)) return new AiProviderError("AI_UNAVAILABLE", message, true, status);
  if (status === 401 || status === 403) return new AiProviderError("AI_AUTH_ERROR", message, false, status);
  if (status === 400 || status === 404) return new AiProviderError("AI_BAD_REQUEST", message, false, status);
  return new AiProviderError("PROVIDER_ERROR", message, false, status);
}

export function publicErrorMessage(code: AiErrorCode) {
  if (code === "AI_TIMEOUT") return "AI 响应超时，可稍后重新理解这个片段。";
  if (code === "AI_RATE_LIMITED" || code === "AI_UNAVAILABLE") return "AI 服务暂时繁忙，可稍后重新理解这个片段。";
  if (code === "AI_AUTH_ERROR") return "AI 服务认证失败，请检查服务端配置。";
  if (code === "AI_BAD_REQUEST") return "AI 请求配置有误，暂时无法理解这个片段。";
  return "视觉理解服务暂时失败，请稍后重试。";
}
