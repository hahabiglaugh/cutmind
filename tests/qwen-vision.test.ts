import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SegmentAnalysisResult } from "../src/domain/types/index.ts";
import { AiProviderError } from "../src/server/vision/ai-provider-error.ts";
import { ConfiguredVisionProvider, visionConfiguration } from "../src/server/vision/configured-vision-provider.ts";
import { QWEN_MAX_ATTEMPTS, QWEN_REQUEST_TIMEOUT_MS, QWEN_SINGAPORE_BASE_URL, QWEN_VISION_MODEL } from "../src/server/vision/qwen-config.ts";
import { QwenVisionProvider } from "../src/server/vision/qwen-vision-provider.ts";
import type { AnalyzeSegmentInput, VisionAnalysisProvider } from "../src/server/vision/vision-analysis-provider.ts";

const input: AnalyzeSegmentInput = { segmentId: "segment-1", videoId: "video-1", startTime: 1, endTime: 6, keyframes: [{ segmentId: "segment-1", videoId: "video-1", timestamp: 3, mimeType: "image/jpeg", data: "encoded-frame" }] };
const structured = { visualDescription: "女子撑伞站在公园草坪边", scene: "户外公园", subjects: ["女子", "雨伞"], actions: ["站立", "转身"], cameraBehavior: "static", visualQuality: 78, informationValue: 58, emotionalValue: 66, novelty: 45, audienceAppeal: 61, possibleRoles: ["transition", "b_roll"], momentSummary: "女子撑伞停留后转身离开" };
const ok = (value: unknown = structured) => new Response(JSON.stringify({ choices: [{ message: { content: typeof value === "string" ? value : JSON.stringify(value) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });

test("Singapore Qwen configuration is centralized and missing key is detected", () => { assert.equal(QWEN_VISION_MODEL, "qwen3-vl-flash"); assert.equal(QWEN_SINGAPORE_BASE_URL, "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"); assert.equal(QWEN_REQUEST_TIMEOUT_MS, 30_000); assert.equal(QWEN_MAX_ATTEMPTS, 2); assert.deepEqual(visionConfiguration({ VISION_PROVIDER: "qwen" }), { provider: "qwen", model: QWEN_VISION_MODEL, configured: false }); });

test("Qwen returns Chinese data compatible with SegmentAnalysis", async () => {
  let requestBody = ""; const provider = new QwenVisionProvider("test-key", { fetch: async (_url, init) => { requestBody = String(init?.body); return ok(); } });
  const result = await provider.analyzeSegment(input); assert.equal(result.provider, "qwen"); assert.equal(result.model, QWEN_VISION_MODEL); assert.match(result.momentSummary, /女子/); assert.equal(result.segmentId, input.segmentId); assert.match(requestBody, /data:image\/jpeg;base64,encoded-frame/); assert.match(requestBody, /json_object/);
});

test("invalid JSON receives at most one repair", async () => { let calls = 0; const provider = new QwenVisionProvider("test", { fetch: async () => { calls += 1; return calls === 1 ? ok("not json") : ok(); } }); const result = await provider.analyzeSegment(input); assert.equal(result.provider, "qwen"); assert.equal(calls, 2); });
test("invalid schema receives at most one repair", async () => { let calls = 0; const provider = new QwenVisionProvider("test", { fetch: async () => { calls += 1; return calls === 1 ? ok({ ...structured, audienceAppeal: 200 }) : ok(); } }); await provider.analyzeSegment(input); assert.equal(calls, 2); });

for (const status of [429, 503]) test(`Qwen ${status} retries once`, async () => { let calls = 0; const provider = new QwenVisionProvider("test", { fetch: async () => { calls += 1; return calls === 1 ? new Response("{}", { status }) : ok(); }, sleep: async () => {} }); await provider.analyzeSegment(input); assert.equal(calls, 2); });
for (const status of [400, 401, 403]) test(`Qwen ${status} does not retry`, async () => { let calls = 0; const provider = new QwenVisionProvider("test", { fetch: async () => { calls += 1; return new Response("{}", { status }); }, sleep: async () => {} }); await assert.rejects(provider.analyzeSegment(input)); assert.equal(calls, 1); });

test("Qwen timeout retries only once", async () => { let calls = 0; const provider = new QwenVisionProvider("test", { fetch: async (_url, init) => { calls += 1; return await new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })); }, sleep: async () => {}, timeoutMs: 2 }); await assert.rejects(provider.analyzeSegment(input), (error: unknown) => error instanceof AiProviderError && error.code === "AI_TIMEOUT"); assert.equal(calls, 2); });

class StubProvider implements VisionAnalysisProvider { readonly name: string; readonly model: string; private readonly run: () => Promise<SegmentAnalysisResult>; constructor(name: string, model: string, run: () => Promise<SegmentAnalysisResult>) { this.name = name; this.model = model; this.run = run; } analyzeSegment() { return this.run(); } }
test("transient Qwen failure falls back to Gemini", async () => { let geminiCalls = 0; const qwen = new StubProvider("qwen", QWEN_VISION_MODEL, async () => { throw new AiProviderError("AI_UNAVAILABLE", "busy", true); }); const gemini = new StubProvider("gemini", "gemini-3.7-flash", async () => { geminiCalls += 1; return { ...structured, segmentId: input.segmentId, provider: "gemini", model: "gemini-3.7-flash", analyzedAt: "now" } as SegmentAnalysisResult; }); const result = await new ConfiguredVisionProvider({ qwen: "configured", gemini: "configured" }, "qwen", { qwen, gemini }).analyzeSegment(input); assert.equal(result.provider, "gemini"); assert.equal(geminiCalls, 1); });
test("Qwen configuration errors do not fallback", async () => { let geminiCalls = 0; const qwen = new StubProvider("qwen", QWEN_VISION_MODEL, async () => { throw new AiProviderError("AI_BAD_REQUEST", "bad", false, 400); }); const gemini = new StubProvider("gemini", "gemini-3.7-flash", async () => { geminiCalls += 1; throw new Error("must not run"); }); await assert.rejects(new ConfiguredVisionProvider({ qwen: "configured", gemini: "configured" }, "qwen", { qwen, gemini }).analyzeSegment(input)); assert.equal(geminiCalls, 0); });
test("existing successful analyses remain cached and Story Discovery stays on Gemini", () => { const context = readFileSync(new URL("../src/features/project/project-session-context.tsx", import.meta.url), "utf8"); const story = readFileSync(new URL("../src/server/story/gemini-story-discovery-provider.ts", import.meta.url), "utf8"); assert.match(context, /!force && analysesRef\.current\[segment\.id\]/); assert.match(story, /GeminiStoryDiscoveryProvider/); assert.doesNotMatch(story, /QwenVisionProvider|DASHSCOPE/); });
