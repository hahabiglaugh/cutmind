import type { SegmentAnalysisResult } from "../../domain/types/index.ts";
import { GEMINI_MODEL_CHAIN, GEMINI_REQUEST_TIMEOUT_MS, PRIMARY_GEMINI_MODEL, VISION_PROVIDER_NAME, geminiGenerateContentEndpoint } from "./config.ts";
import { AiProviderError, classifyHttpError } from "./ai-provider-error.ts";
import { withGeminiRetry, type RetryDependencies, type RetryEvent } from "./gemini-retry-policy.ts";
import { withModelFallback } from "./gemini-model-chain.ts";
import type { VisionAnalysisProgressEvent } from "./vision-analysis-provider.ts";
import { segmentAnalysisJsonSchema, validateSegmentAnalysis } from "./segment-analysis-schema.ts";
import type { AnalyzeSegmentInput, VisionAnalysisProvider } from "./vision-analysis-provider.ts";
import { scheduledGeminiFetch } from "./scheduled-gemini-fetch.ts";

export const SEGMENT_ANALYSIS_PROMPT = `你正在帮助中文短视频创作者理解素材。只能根据按时间顺序提供的画面进行分析。
visualDescription、momentSummary、scene、subjects 和 actions 必须使用自然、简洁的简体中文；cameraBehavior 与 possibleRoles 必须严格保留 schema 中规定的英文枚举。
客观描述画面，不夸大，不进行最终的 Story-specific 判断，也不要把素材称为“垃圾”或“没用”。
将 visualQuality、informationValue、emotionalValue、novelty 与 audienceAppeal 分别独立评分。不要因为画面漂亮就自动给出高 audienceAppeal，也要把个人纪念价值与大众观看价值分开。
判断 audienceAppeal 时应考虑：是否发生事件或变化、是否有人物反应、是否提供信息、陌生观众是否容易理解，以及是否具有潜在叙事作用。
尊重画面中的人物，不猜测敏感属性；证据不足时明确表达无法判断。只返回符合指定 schema 的 JSON。`;

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

function outputText(payload: GeminiResponse) {
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
}

export class GeminiVisionProvider implements VisionAnalysisProvider {
  readonly name = VISION_PROVIDER_NAME;
  readonly model = PRIMARY_GEMINI_MODEL;

  private readonly apiKey: string; private readonly dependencies: RetryDependencies & { fetch?: typeof fetch };
  constructor(apiKey: string, dependencies: RetryDependencies & { fetch?: typeof fetch } = {}) { this.apiKey = apiKey; this.dependencies = dependencies; }

  async analyzeSegment(input: AnalyzeSegmentInput, onProgress?: (event: VisionAnalysisProgressEvent) => void): Promise<SegmentAnalysisResult> {
    const fetcher = this.dependencies.fetch ?? fetch;
    const analysisStartedAt = Date.now();
    let attempts = 0;
    const result = await withModelFallback(GEMINI_MODEL_CHAIN, async (model) => withGeminiRetry(async (attempt) => {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);
      let status: number | undefined;
      try {
        const response = await scheduledGeminiFetch(fetcher, geminiGenerateContentEndpoint(model), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { text: `${SEGMENT_ANALYSIS_PROMPT}\nSegment: ${input.startTime.toFixed(2)}s–${input.endTime.toFixed(2)}s. Frames are chronological and labeled by source timestamp.` },
            ...input.keyframes.flatMap((frame) => [
              { text: `Frame at ${frame.timestamp.toFixed(2)} seconds:` },
              { inlineData: { data: frame.data, mimeType: frame.mimeType } },
            ]),
          ] }],
          generationConfig: { responseMimeType: "application/json", responseJsonSchema: segmentAnalysisJsonSchema, thinkingConfig: { thinkingLevel: "low" } },
        }),
        }, { type: input.priority === "high" ? "manual_segment_analysis" : "segment_analysis", priority: input.priority ?? "normal", onSchedulerEvent: (event) => onProgress?.({ ...event, model }) });
        status = response.status;
        if (!response.ok) {
          throw classifyHttpError(response.status, `Gemini HTTP ${response.status}`);
        }
        let payload: GeminiResponse;
        try { payload = await response.json() as GeminiResponse; }
        catch {
          if (controller.signal.aborted) throw new AiProviderError("AI_TIMEOUT", `Gemini timed out after ${GEMINI_REQUEST_TIMEOUT_MS}ms`, true);
          throw new AiProviderError("PROVIDER_ERROR", "Gemini returned invalid JSON", false, response.status);
        }
        const text = outputText(payload);
        try { return validateSegmentAnalysis(JSON.parse(text), { segmentId: input.segmentId, provider: this.name, model, analyzedAt: new Date().toISOString() }); }
        catch (error) { throw new AiProviderError("PROVIDER_ERROR", error instanceof Error ? error.message : "Invalid structured response", false, response.status); }
      } catch (error) {
        const classified = error instanceof AiProviderError
          ? error
          : controller.signal.aborted
            ? new AiProviderError("AI_TIMEOUT", `Gemini timed out after ${GEMINI_REQUEST_TIMEOUT_MS}ms`, true)
            : new AiProviderError("AI_UNAVAILABLE", "Gemini network request failed", true);
        console.error("Gemini attempt failed", { model, attempt, durationMs: Date.now() - startedAt, httpStatus: status, category: classified.code });
        throw classified;
      } finally {
        clearTimeout(timeout);
      }
    }, (event: RetryEvent) => { if (event.state === "attempt") attempts += 1; onProgress?.({ ...event, model }); }, this.dependencies), onProgress);
    if (process.env.NODE_ENV === "development") console.info("Gemini segment analyzed", { segmentId: input.segmentId, frameCount: input.keyframes.length, model: result.model, durationMs: Date.now() - analysisStartedAt, attempts, fallbackUsed: result.model !== PRIMARY_GEMINI_MODEL });
    return result;
  }
}
