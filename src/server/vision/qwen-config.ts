export const QWEN_VISION_MODEL = "qwen3-vl-flash";
export const QWEN_SINGAPORE_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
export const qwenChatCompletionsEndpoint = `${QWEN_SINGAPORE_BASE_URL}/chat/completions`;
export const QWEN_REQUEST_TIMEOUT_MS = 30_000;
export const QWEN_MAX_ATTEMPTS = 2;
export const QWEN_RETRY_AFTER_MAX_MS = 30_000;
export type VisionProviderSelection = "qwen" | "gemini";
export const DEFAULT_VISION_PROVIDER: VisionProviderSelection = "qwen";
export const DEFAULT_STORY_PROVIDER: VisionProviderSelection = "qwen";
export function configuredVisionProvider(value = process.env.VISION_PROVIDER): VisionProviderSelection { return value === "gemini" ? "gemini" : DEFAULT_VISION_PROVIDER; }
