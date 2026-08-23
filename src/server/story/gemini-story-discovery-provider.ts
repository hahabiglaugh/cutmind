import type { StoryCandidate } from "@/domain/types";
import type { StoryDiscoverySegmentInput } from "@/features/story-discovery/story-discovery-input";
import { AiProviderError, classifyHttpError } from "@/server/vision/ai-provider-error";
import { GEMINI_MODEL_CHAIN, GEMINI_REQUEST_TIMEOUT_MS, PRIMARY_GEMINI_MODEL, STORY_DISCOVERY_MAX_ATTEMPTS, VISION_PROVIDER_NAME, geminiGenerateContentEndpoint } from "@/server/vision/config";
import { withModelFallback } from "@/server/vision/gemini-model-chain";
import { withGeminiRetry, type RetryDependencies, type RetryEvent } from "@/server/vision/gemini-retry-policy";
import type { VisionAnalysisProgressEvent } from "@/server/vision/vision-analysis-provider";
import { storyDiscoveryJsonSchema, validateStoryCandidates } from "./story-candidate-schema";
import { scheduledGeminiFetch } from "@/server/vision/scheduled-gemini-fetch";
import { STORY_DISCOVERY_PROMPT } from "./story-discovery-prompt";

interface GeminiResponse { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
function outputText(payload: GeminiResponse) { return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? ""; }

export class GeminiStoryDiscoveryProvider {
  readonly name = VISION_PROVIDER_NAME;
  readonly model = PRIMARY_GEMINI_MODEL;
  constructor(private readonly apiKey: string, private readonly dependencies: RetryDependencies & { fetch?: typeof fetch } = {}) {}

  async discover(segments: StoryDiscoverySegmentInput[], onProgress?: (event: VisionAnalysisProgressEvent) => void, signal?: AbortSignal): Promise<StoryCandidate[]> {
    const fetcher = this.dependencies.fetch ?? fetch;
    return withModelFallback(GEMINI_MODEL_CHAIN, async (model) => withGeminiRetry(async (attempt) => {
      const startedAt = Date.now(); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS); let status: number | undefined;
      try {
        const response = await scheduledGeminiFetch(fetcher, geminiGenerateContentEndpoint(model), { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `${STORY_DISCOVERY_PROMPT}\n\n结构化 Segment 输入：\n${JSON.stringify({ segments })}` }] }], generationConfig: { responseMimeType: "application/json", responseJsonSchema: storyDiscoveryJsonSchema, thinkingConfig: { thinkingLevel: "medium" } } }) }, { type: "story_discovery", priority: "high", signal, onSchedulerEvent: (event) => onProgress?.({ ...event, model }) });
        status = response.status;
        if (!response.ok) throw classifyHttpError(response.status, `Gemini HTTP ${response.status}`);
        let payload: GeminiResponse; try { payload = await response.json() as GeminiResponse; } catch { if (controller.signal.aborted) throw new AiProviderError("AI_TIMEOUT", "Story discovery timed out", true); throw new AiProviderError("PROVIDER_ERROR", "Gemini returned invalid JSON", false, status); }
        try { return validateStoryCandidates(JSON.parse(outputText(payload)), segments, { provider: this.name, model, createdAt: new Date().toISOString() }); }
        catch (error) { throw new AiProviderError("PROVIDER_ERROR", error instanceof Error ? error.message : "Invalid story output", false, status); }
      } catch (error) {
        const classified = error instanceof AiProviderError ? error : controller.signal.aborted ? new AiProviderError("AI_TIMEOUT", "Story discovery timed out", true) : new AiProviderError("AI_UNAVAILABLE", "Gemini network request failed", true);
        console.error("Gemini story attempt failed", { model, attempt, durationMs: Date.now() - startedAt, httpStatus: status, category: classified.code }); throw classified;
      } finally { clearTimeout(timeout); }
    }, (event: RetryEvent) => onProgress?.({ ...event, model }), this.dependencies, STORY_DISCOVERY_MAX_ATTEMPTS), onProgress, (error) => error.code !== "AI_RATE_LIMITED" && error.retryable);
  }
}
