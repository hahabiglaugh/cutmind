import type { StoryCandidate } from "../../domain/types/index.ts";
import type { StoryDiscoverySegmentInput } from "../../features/story-discovery/story-discovery-input.ts";
import { STORY_DISCOVERY_MAX_ATTEMPTS, STORY_DISCOVERY_REQUEST_TIMEOUT_MS } from "../../features/story-discovery/config.ts";
import { QWEN_VISION_MODEL } from "../vision/qwen-config.ts";
import { requestQwenJson, type QwenRequestDiagnostics } from "../vision/qwen-json-request.ts";
import type { VisionAnalysisProgressEvent } from "../vision/vision-analysis-provider.ts";
import { STORY_DISCOVERY_PROMPT } from "./story-discovery-prompt.ts";
import { storyDiscoveryJsonSchema, validateStoryCandidates } from "./story-candidate-schema.ts";

export const QWEN_STORY_OUTPUT_INSTRUCTION = `Return ONLY valid JSON. The top-level JSON object MUST contain the key "candidates". Every candidate MUST conform exactly to this JSON Schema, including every required field and the exact field names. Do not rename "structure" to "beats". Do not add "segmentOrder". Do not return Markdown, a JSON code fence, or any explanation before or after the JSON. JSON Schema: ${JSON.stringify(storyDiscoveryJsonSchema)}`;
export function adaptQwenStoryResponse(value: unknown): unknown { if (Array.isArray(value)) return { candidates: value }; if (value && typeof value === "object") { const record = value as Record<string, unknown>; if (Array.isArray(record.candidates)) return value; if (Object.keys(record).length === 1 && Array.isArray(record.stories)) return { candidates: record.stories }; } return value; }

export class QwenStoryDiscoveryProvider {
  readonly name = "qwen"; readonly model = QWEN_VISION_MODEL;
  private readonly apiKey: string; private readonly fetcher?: typeof fetch; private readonly sleep?: (ms: number) => Promise<void>; private readonly diagnostics?: QwenRequestDiagnostics;
  constructor(apiKey: string, fetcher?: typeof fetch, sleep?: (ms: number) => Promise<void>, diagnostics?: QwenRequestDiagnostics) { this.apiKey = apiKey; this.fetcher = fetcher; this.sleep = sleep; this.diagnostics = diagnostics; }
  discover(segments: StoryDiscoverySegmentInput[], onProgress?: (event: VisionAnalysisProgressEvent) => void, signal?: AbortSignal): Promise<StoryCandidate[]> { return requestQwenJson({ apiKey: this.apiKey, prompt: `${STORY_DISCOVERY_PROMPT}\n${QWEN_STORY_OUTPUT_INSTRUCTION}`, payload: { segments }, requestType: "story_discovery", timeoutMs: STORY_DISCOVERY_REQUEST_TIMEOUT_MS, maxAttempts: STORY_DISCOVERY_MAX_ATTEMPTS, onProgress, signal, fetcher: this.fetcher, sleep: this.sleep, diagnostics: this.diagnostics, validate: (value) => validateStoryCandidates(adaptQwenStoryResponse(value), segments, { provider: this.name, model: this.model, createdAt: new Date().toISOString() }) }); }
}
