import assert from "node:assert/strict";
import test from "node:test";
import { segmentAnalysisJsonSchema, validateSegmentAnalysis } from "../src/server/vision/segment-analysis-schema.ts";
import { selectKeyframeTimestamps } from "../src/features/analysis/keyframe-extraction.ts";
import { analysisRoleLabels, cameraBehaviorLabels } from "../src/features/analysis/ui-labels.ts";
import { readFileSync } from "node:fs";

const valid = {
  visualDescription: "A traveler walks into a busy station.", scene: "Train station", subjects: ["traveler"], actions: ["walking"], cameraBehavior: "tracking",
  visualQuality: 72, informationValue: 64, emotionalValue: 48, novelty: 40, audienceAppeal: 68,
  possibleRoles: ["context", "story_progression"], momentSummary: "Arrival at the station",
};
const metadata = { segmentId: "segment-1", provider: "test", model: "test-model", analyzedAt: "2026-08-22T00:00:00.000Z" };

test("validates a complete structured analysis", () => {
  assert.equal(validateSegmentAnalysis(valid, metadata).segmentId, "segment-1");
});

test("rejects scores outside the schema range", () => {
  assert.throws(() => validateSegmentAnalysis({ ...valid, audienceAppeal: 101 }, metadata), /invalid scores/);
});

test("selects at most two chronological keyframes", () => {
  assert.deepEqual(selectKeyframeTimestamps({ startTime: 10, endTime: 20, duration: 10 }), [12.5, 17.5]);
});

test("segments up to 3s use one midpoint keyframe", () => assert.deepEqual(selectKeyframeTimestamps({ startTime: 2, endTime: 5, duration: 3 }), [3.5]));
test("segments over 3s through 7s use two keyframes", () => assert.deepEqual(selectKeyframeTimestamps({ startTime: 10, endTime: 17, duration: 7 }).map((value) => Number(value.toFixed(2))), [11.75, 15.25]));
test("segments over 7s through 15s use two keyframes", () => assert.deepEqual(selectKeyframeTimestamps({ startTime: 0, endTime: 15, duration: 15 }), [3.75, 11.25]));
test("segments over 15s still use at most two keyframes", () => assert.equal(selectKeyframeTimestamps({ startTime: 0, endTime: 30, duration: 30 }).length, 2));

test("analysis enum UI mappings are Chinese and complete", () => {
  assert.equal(analysisRoleLabels.hook, "开场钩子"); assert.equal(analysisRoleLabels.b_roll, "补充镜头");
  assert.equal(cameraBehaviorLabels.handheld, "手持拍摄"); assert.equal(cameraBehaviorLabels.unknown, "未识别");
});

test("Gemini prompt explicitly requires Simplified Chinese", () => {
  const providerSource = readFileSync(new URL("../src/server/vision/gemini-vision-provider.ts", import.meta.url), "utf8");
  assert.match(providerSource, /必须使用自然、简洁的简体中文/);
});

test("analysis output schema remains backward compatible", () => {
  assert.deepEqual(segmentAnalysisJsonSchema.required, ["visualDescription", "scene", "subjects", "actions", "cameraBehavior", "visualQuality", "informationValue", "emotionalValue", "novelty", "audienceAppeal", "possibleRoles", "momentSummary"]);
});
