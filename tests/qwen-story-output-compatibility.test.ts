import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { StoryDiscoverySegmentInput } from "../src/features/story-discovery/story-discovery-input.ts";
import { adaptQwenStoryResponse, QWEN_STORY_OUTPUT_INSTRUCTION } from "../src/server/story/qwen-story-discovery-provider.ts";
import { QwenStoryDiscoveryProvider } from "../src/server/story/qwen-story-discovery-provider.ts";
import { STORY_DISCOVERY_MAX_ATTEMPTS, STORY_DISCOVERY_REQUEST_TIMEOUT_MS } from "../src/features/story-discovery/config.ts";
import { validateStoryCandidates } from "../src/server/story/story-candidate-schema.ts";
import { parseQwenJsonContent } from "../src/server/vision/qwen-json-request.ts";

const source: StoryDiscoverySegmentInput = { segmentId: "real-segment", videoAssetId: "video-1", startTime: 0, endTime: 5, duration: 5, candidateScore: 80, candidateTier: "high", momentSummary: "人物开始行动", visualDescription: "人物在户外行走", scene: "户外", subjects: ["人物"], actions: ["行走"], cameraBehavior: "tracking", visualQuality: 80, informationValue: 70, emotionalValue: 60, novelty: 50, audienceAppeal: 75, possibleRoles: ["hook"] };
const candidate = { title: "真实旅程", concept: "一次真实出发", storyType: "experience", hook: "人物直接开始行动", coreIdea: "记录行动变化", targetViewerValue: ["获得现场感"], estimatedDuration: 5, segmentRefs: [{ segmentId: source.segmentId, role: "hook", reason: "动作明确", suggestedStartTime: 0, suggestedEndTime: 5 }], structure: [{ type: "hook", description: "开始", segmentRefs: [source.segmentId] }, { type: "development", description: "推进", segmentRefs: [source.segmentId] }, { type: "ending", description: "结束", segmentRefs: [source.segmentId] }], whyItWorks: "真实动作形成变化", confidence: 80 };
const validate = (value: unknown) => validateStoryCandidates(adaptQwenStoryResponse(value), [source], { provider: "qwen", model: "qwen3-vl-flash", createdAt: "now" });

test("canonical candidates wrapper passes", () => assert.equal(validate({ candidates: [candidate] }).length, 1));
test("stories wrapper is adapted without changing candidate fields", () => assert.equal(validate({ stories: [candidate] }).length, 1));
test("top-level candidate array is adapted", () => assert.equal(validate([candidate]).length, 1));
test("missing required candidate fields remains invalid", () => assert.throws(() => validate({ stories: [{ title: "不完整" }] }), /candidate\[0\]\.concept expected non-empty string, received undefined/));
test("real Qwen-shaped candidate reports the first exact missing field path", () => { const actualShape = { candidates: [{ hook: "开场", coreIdea: "核心", storyType: "experience", segmentOrder: [source.segmentId], targetViewerValue: ["价值"], beats: [], suggestedStartTime: 0, suggestedEndTime: 5, segmentRefs: [] }] }; assert.throws(() => validate(actualShape), /candidate\[0\]\.title expected non-empty string, received undefined/); });
test("invalid segment reference is never replaced or removed", () => assert.throws(() => validate({ candidates: [{ ...candidate, segmentRefs: [{ ...candidate.segmentRefs[0], segmentId: "fake" }] }] }), /Unknown segment reference: fake/));
test("single JSON code fence is parsed safely", () => { const parsed = parseQwenJsonContent(`\`\`\`json\n${JSON.stringify({ candidates: [candidate] })}\n\`\`\``); assert.equal(parsed.shape.hadCodeFence, true); assert.equal(validate(parsed.value).length, 1); });
test("natural language is not guessed into JSON", () => assert.throws(() => parseQwenJsonContent(`这是结果：${JSON.stringify({ candidates: [candidate] })}`), SyntaxError));
test("Qwen prompt includes the existing Story schema and exact field names", () => { assert.match(QWEN_STORY_OUTPUT_INSTRUCTION, /top-level JSON object MUST contain the key "candidates"/); assert.match(QWEN_STORY_OUTPUT_INSTRUCTION, /Do not return Markdown/); assert.match(QWEN_STORY_OUTPUT_INSTRUCTION, /"required":\["title","concept","storyType","hook","coreIdea"/); assert.match(QWEN_STORY_OUTPUT_INSTRUCTION, /Do not rename "structure" to "beats"/); });
test("failed provider validation retains the active model in UI state", () => { const sourceCode = readFileSync(new URL("../src/features/project/project-session-context.tsx", import.meta.url), "utf8"); assert.match(sourceCode, /setStoryDiscovery\(\(current\) => \(\{ \.\.\.current, status: "error"/); });
test("Story Discovery uses a 60s timeout and one total attempt", async () => { assert.equal(STORY_DISCOVERY_REQUEST_TIMEOUT_MS, 60_000); assert.equal(STORY_DISCOVERY_MAX_ATTEMPTS, 1); let calls = 0; const fetcher = async () => { calls += 1; return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ candidates: [{ title: "不完整" }] }) } }] }), { status: 200 }); }; await assert.rejects(new QwenStoryDiscoveryProvider("test", fetcher as typeof fetch, async () => {}).discover([source])); assert.equal(calls, 1); });
