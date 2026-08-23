import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { nextPreviewIndex } from "../src/features/editing-plan/preview-sequence.ts";

test("preview advances in order and stops after the final item", () => { assert.equal(nextPreviewIndex(0, 3), 1); assert.equal(nextPreviewIndex(1, 3), 2); assert.equal(nextPreviewIndex(2, 3), null); });
test("preview remains browser-local and uses Editing Plan source bounds", () => { const source = readFileSync(new URL("../src/components/editing-plan-preview.tsx", import.meta.url), "utf8"); assert.match(source, /runtimeUrls\[item\.sourceVideoId\]/); assert.match(source, /item\.sourceStart/); assert.match(source, /item\.sourceEnd/); assert.doesNotMatch(source, /fetch\(|Qwen|Gemini|upload|generate-editing-plan/); });
