import type { SegmentAnalysisResult } from "../../domain/types/index.ts";
import { AiProviderError } from "./ai-provider-error.ts";
import { GeminiVisionProvider } from "./gemini-vision-provider.ts";
import { QwenVisionProvider } from "./qwen-vision-provider.ts";
import { configuredVisionProvider, QWEN_VISION_MODEL } from "./qwen-config.ts";
import type { AnalyzeSegmentInput, VisionAnalysisProgressEvent, VisionAnalysisProvider } from "./vision-analysis-provider.ts";
import { recordVisionBenchmark } from "./vision-benchmark.ts";

export interface ProviderRouterDependencies { qwen?: VisionAnalysisProvider; gemini?: VisionAnalysisProvider; now?: () => number }
export class ConfiguredVisionProvider implements VisionAnalysisProvider {
  readonly name: string; readonly model: string;
  private readonly primary: VisionAnalysisProvider; private readonly gemini?: VisionAnalysisProvider; private readonly now: () => number;
  constructor(keys: { qwen?: string; gemini?: string }, selection = configuredVisionProvider(), dependencies: ProviderRouterDependencies = {}) {
    this.primary = selection === "qwen" ? dependencies.qwen ?? new QwenVisionProvider(keys.qwen ?? "") : dependencies.gemini ?? new GeminiVisionProvider(keys.gemini ?? "");
    this.gemini = selection === "qwen" && keys.gemini ? dependencies.gemini ?? new GeminiVisionProvider(keys.gemini) : undefined;
    this.name = this.primary.name; this.model = this.primary.model; this.now = dependencies.now ?? Date.now;
  }
  async analyzeSegment(input: AnalyzeSegmentInput, onProgress?: (event: VisionAnalysisProgressEvent) => void): Promise<SegmentAnalysisResult> {
    const startedAt = this.now(); let fallbackUsed = false; let errorType: string | undefined; let success = false; let attemptCount = 0; let finalProvider = this.primary.name; let finalModel = this.primary.model;
    const progress = (event: VisionAnalysisProgressEvent) => { if (event.state === "attempt") attemptCount += 1; onProgress?.(event); };
    try {
      try { const result = await this.primary.analyzeSegment(input, progress); success = true; return result; }
      catch (error) {
        errorType = error instanceof AiProviderError ? error.code : "PROVIDER_ERROR";
        if (!(error instanceof AiProviderError) || !error.retryable || !this.gemini) throw error;
        fallbackUsed = true; onProgress?.({ state: "switching_model", previousModel: this.primary.model, model: this.gemini.model, category: error.code });
        finalProvider = this.gemini.name; finalModel = this.gemini.model; const result = await this.gemini.analyzeSegment(input, progress); success = true; return result;
      }
    } finally {
      recordVisionBenchmark({ provider: finalProvider, model: finalModel, frameCount: input.keyframes.length, attemptCount, durationMs: this.now() - startedAt, success, errorType: success ? undefined : errorType, fallbackUsed });
    }
  }
}

export function visionConfiguration(environment: NodeJS.ProcessEnv | { VISION_PROVIDER?: string; DASHSCOPE_API_KEY?: string; GEMINI_API_KEY?: string } = process.env) { const provider = configuredVisionProvider(environment.VISION_PROVIDER); return { provider, model: provider === "qwen" ? QWEN_VISION_MODEL : new GeminiVisionProvider("").model, configured: provider === "qwen" ? Boolean(environment.DASHSCOPE_API_KEY) : Boolean(environment.GEMINI_API_KEY) }; }
