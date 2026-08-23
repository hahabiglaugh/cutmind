import type { StoryCandidate } from "../../domain/types/index.ts";
import type { StoryDiscoverySegmentInput } from "../../features/story-discovery/story-discovery-input.ts";
import { AiProviderError } from "../vision/ai-provider-error.ts";
import { DEFAULT_STORY_PROVIDER } from "../vision/qwen-config.ts";
import type { VisionAnalysisProgressEvent } from "../vision/vision-analysis-provider.ts";
import { GeminiStoryDiscoveryProvider } from "./gemini-story-discovery-provider.ts";
import { QwenStoryDiscoveryProvider } from "./qwen-story-discovery-provider.ts";

export class ConfiguredStoryDiscoveryProvider {
  readonly name = DEFAULT_STORY_PROVIDER;
  private readonly qwen: QwenStoryDiscoveryProvider; private readonly gemini?: GeminiStoryDiscoveryProvider;
  constructor(qwen: QwenStoryDiscoveryProvider, gemini?: GeminiStoryDiscoveryProvider) { this.qwen = qwen; this.gemini = gemini; }
  async discover(segments: StoryDiscoverySegmentInput[], onProgress?: (event: VisionAnalysisProgressEvent) => void, signal?: AbortSignal): Promise<StoryCandidate[]> { try { return await this.qwen.discover(segments, onProgress, signal); } catch (error) { if (!(error instanceof AiProviderError) || !error.retryable || !this.gemini) throw error; onProgress?.({ state: "switching_model", previousModel: this.qwen.model, model: this.gemini.model, category: error.code }); return this.gemini.discover(segments, onProgress, signal); } }
}
