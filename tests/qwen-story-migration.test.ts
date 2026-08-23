import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_STORY_PROVIDER, DEFAULT_VISION_PROVIDER } from "../src/server/vision/qwen-config.ts";
test("Segment and Story defaults are Qwen", () => { assert.equal(DEFAULT_VISION_PROVIDER, "qwen"); assert.equal(DEFAULT_STORY_PROVIDER, "qwen"); });
test("Story route uses Qwen primary and keeps Gemini fallback", () => { const source = readFileSync(new URL("../src/app/api/discover-stories/route.ts", import.meta.url), "utf8"); assert.match(source, /QwenStoryDiscoveryProvider/); assert.match(source, /GeminiStoryDiscoveryProvider/); assert.match(source, /ConfiguredStoryDiscoveryProvider/); });
test("Qwen Story Discovery sends structured text and no media", () => { const source = readFileSync(new URL("../src/server/story/qwen-story-discovery-provider.ts", import.meta.url), "utf8"); assert.match(source, /provider: this\.name, model: this\.model/); assert.doesNotMatch(source, /image_url|inlineData|base64|keyframes|video/); });
test("existing Gemini provider data remains vendor-neutral", () => { const source = readFileSync(new URL("../src/domain/types/story-candidate.ts", import.meta.url), "utf8"); assert.match(source, /provider\?: string/); assert.match(source, /model\?: string/); });
