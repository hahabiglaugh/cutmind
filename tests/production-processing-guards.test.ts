import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  KEYFRAME_JPEG_QUALITY,
  MAX_AI_CONCURRENCY,
  MAX_ANALYZE_SEGMENT_REQUEST_BYTES,
  MAX_KEYFRAME_DIMENSION,
  MAX_KEYFRAMES_PER_SEGMENT,
  MAX_LOCAL_VIDEO_PROCESSING_CONCURRENCY,
} from "../src/features/processing/config.ts";
import { runAnalysisQueue } from "../src/features/analysis/sequential-analysis-queue.ts";

test("production media limits stay below the Vercel request boundary", () => {
  assert.equal(MAX_LOCAL_VIDEO_PROCESSING_CONCURRENCY, 2);
  assert.equal(MAX_AI_CONCURRENCY, 2);
  assert.equal(MAX_KEYFRAME_DIMENSION, 512);
  assert.ok(KEYFRAME_JPEG_QUALITY >= 0.6 && KEYFRAME_JPEG_QUALITY <= 0.65);
  assert.equal(MAX_KEYFRAMES_PER_SEGMENT, 2);
  assert.ok(MAX_ANALYZE_SEGMENT_REQUEST_BYTES < 4.5 * 1024 * 1024);
});

test("twenty local jobs remain bounded and continue after one failure", async () => {
  let active = 0;
  let maximum = 0;
  const completed: number[] = [];
  await runAnalysisQueue(Array.from({ length: 20 }, (_, index) => index), () => false, async (item) => {
    active += 1;
    maximum = Math.max(maximum, active);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (item === 7) throw new Error("isolated failure");
      completed.push(item);
    } finally {
      active -= 1;
    }
  }, MAX_LOCAL_VIDEO_PROCESSING_CONCURRENCY);
  assert.equal(maximum, 2);
  assert.equal(completed.length, 19);
});

test("client and API independently reject oversized Segment requests", () => {
  const client = readFileSync(new URL("../src/features/project/project-session-context.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/app/api/analyze-segment/route.ts", import.meta.url), "utf8");
  assert.match(client, /MAX_ANALYZE_SEGMENT_REQUEST_BYTES/);
  assert.match(client, /TextEncoder/);
  assert.match(route, /content-length/);
  assert.match(route, /MAX_ANALYZE_SEGMENT_REQUEST_BYTES/);
  assert.match(route, /MAX_KEYFRAMES_PER_SEGMENT/);
  assert.match(route, /maxDuration = 90/);
});
