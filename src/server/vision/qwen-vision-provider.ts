import type { SegmentAnalysisResult } from "../../domain/types/index.ts";
import { AiProviderError, classifyHttpError } from "./ai-provider-error.ts";
import { segmentAnalysisJsonSchema, validateSegmentAnalysis } from "./segment-analysis-schema.ts";
import type { AnalyzeSegmentInput, VisionAnalysisProgressEvent, VisionAnalysisProvider } from "./vision-analysis-provider.ts";
import { QWEN_MAX_ATTEMPTS, QWEN_REQUEST_TIMEOUT_MS, QWEN_RETRY_AFTER_MAX_MS, QWEN_VISION_MODEL, qwenChatCompletionsEndpoint } from "./qwen-config.ts";
import { globalAIRequestScheduler } from "./gemini-request-scheduler.ts";

export const QWEN_SEGMENT_ANALYSIS_PROMPT = `你是 CutMind 的视频素材理解模型。输入图片来自同一个 Video Segment，并按时间顺序排列。你的任务是帮助中文短视频和 Vlog 创作者理解这个片段发生了什么以及它在剪辑中的潜在价值。
判断场景、主体、人物或物体动作、镜头变化、画面质量、信息价值、情绪价值、新鲜度、陌生观众吸引力和潜在用途。不要因为画面漂亮就自动提高 audienceAppeal；重点考虑事件、动作变化、信息、情绪、陌生观众是否容易理解和叙事价值。
禁止虚构地点、人物关系、对白、事件背景或拍摄者意图，无法确定时保守描述。所有自由文本使用简体中文，cameraBehavior 和 possibleRoles 使用 schema 规定的英文枚举。只输出一个符合指定结构的 JSON 对象，不要输出 Markdown。JSON schema: ${JSON.stringify(segmentAnalysisJsonSchema)}`;

interface QwenResponse { choices?: Array<{ message?: { content?: string } }> }
export interface QwenDependencies { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number; timeoutMs?: number }

function retryAfterMs(value: string | null, now: number) { if (!value) return undefined; const seconds = Number(value); const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now; return Number.isFinite(delay) && delay >= 0 ? Math.min(delay, QWEN_RETRY_AFTER_MAX_MS) : undefined; }
function isTransient(error: unknown) { return error instanceof AiProviderError && error.retryable; }

export class QwenVisionProvider implements VisionAnalysisProvider {
  readonly name = "qwen";
  readonly model = QWEN_VISION_MODEL;
  private readonly apiKey: string; private readonly dependencies: QwenDependencies;
  constructor(apiKey: string, dependencies: QwenDependencies = {}) { this.apiKey = apiKey; this.dependencies = dependencies; }

  async analyzeSegment(input: AnalyzeSegmentInput, onProgress?: (event: VisionAnalysisProgressEvent) => void): Promise<SegmentAnalysisResult> {
    const fetcher = this.dependencies.fetch ?? fetch; const sleep = this.dependencies.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))); const now = this.dependencies.now ?? Date.now;
    let lastError: unknown; let repair = false;
    for (let attempt = 1; attempt <= QWEN_MAX_ATTEMPTS; attempt += 1) {
      onProgress?.({ state: "attempt", attempt, maxAttempts: QWEN_MAX_ATTEMPTS, model: this.model, category: lastError instanceof AiProviderError ? lastError.code : undefined });
      const startedAt = now(); const controller = new AbortController(); const timeoutMs = this.dependencies.timeoutMs ?? QWEN_REQUEST_TIMEOUT_MS; const timeout = setTimeout(() => controller.abort(), timeoutMs); let status: number | undefined;
      try {
        const response = await globalAIRequestScheduler.schedule(input.priority === "high" ? "manual_segment_analysis" : "segment_analysis", input.priority ?? "normal", () => fetcher(qwenChatCompletionsEndpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` }, signal: controller.signal, body: JSON.stringify({ model: this.model, messages: [{ role: "system", content: repair ? `${QWEN_SEGMENT_ANALYSIS_PROMPT}\n上一次输出未通过校验。修复 JSON，并且只返回完整 JSON 对象。` : QWEN_SEGMENT_ANALYSIS_PROMPT }, { role: "user", content: [{ type: "text", text: `Segment ${input.startTime.toFixed(2)}s–${input.endTime.toFixed(2)}s，以下关键帧按时间顺序排列。` }, ...input.keyframes.flatMap((frame) => [{ type: "text", text: `Frame ${frame.timestamp.toFixed(2)}s` }, { type: "image_url", image_url: { url: `data:${frame.mimeType};base64,${frame.data}` } }])] }], response_format: { type: "json_object" }, enable_thinking: false }) }), { onEvent: (event) => onProgress?.({ ...event, model: this.model }) });
        status = response.status;
        if (!response.ok) { const error = classifyHttpError(status, `Qwen HTTP ${status}`) as AiProviderError & { retryAfterMs?: number }; error.retryAfterMs = retryAfterMs(response.headers.get("retry-after"), now()); if (status === 429 && !this.dependencies.sleep) globalAIRequestScheduler.enterRateLimitCooldown(error.retryAfterMs); throw error; }
        const payload = await response.json() as QwenResponse; const content = payload.choices?.[0]?.message?.content;
        if (!content) throw new AiProviderError("PROVIDER_ERROR", "Qwen returned empty content", false, status);
        try { return validateSegmentAnalysis(JSON.parse(content), { segmentId: input.segmentId, provider: this.name, model: this.model, analyzedAt: new Date().toISOString() }); }
        catch (error) { if (attempt < QWEN_MAX_ATTEMPTS) { repair = true; lastError = new AiProviderError("PROVIDER_ERROR", error instanceof Error ? error.message : "Invalid Qwen JSON", false, status); continue; } throw new AiProviderError("PROVIDER_ERROR", error instanceof Error ? error.message : "Invalid Qwen JSON", false, status); }
      } catch (error) {
        const classified = error instanceof AiProviderError ? error : controller.signal.aborted ? new AiProviderError("AI_TIMEOUT", `Qwen timed out after ${timeoutMs}ms`, true) : new AiProviderError("AI_UNAVAILABLE", "Qwen network request failed", true);
        lastError = classified;
        console.error("Qwen attempt failed", { model: this.model, attempt, durationMs: now() - startedAt, httpStatus: status, category: classified.code });
        if (!isTransient(classified) || attempt === QWEN_MAX_ATTEMPTS) throw classified;
        const delay = (classified as AiProviderError & { retryAfterMs?: number }).retryAfterMs ?? 1_500;
        onProgress?.({ state: "retrying", attempt: attempt + 1, maxAttempts: QWEN_MAX_ATTEMPTS, model: this.model, category: classified.code, delayMs: delay });
        await sleep(delay);
      } finally { clearTimeout(timeout); }
    }
    throw lastError;
  }
}
