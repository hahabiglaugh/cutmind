import assert from "node:assert/strict";
import test from "node:test";
import { createSegmentIntervals } from "../src/features/segmentation/segment-boundaries.ts";

test("creates precise intervals from scene boundaries", () => {
  const segments = createSegmentIntervals(7.02, [2.38, 5.14]);
  assert.deepEqual(segments.map(({ startTime, endTime }) => [startTime, endTime]), [[0, 2.38], [2.38, 5.14], [5.14, 7.02]]);
});

test("always creates at least one segment when no boundary exists", () => {
  const segments = createSegmentIntervals(4.5, []);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].startTime, 0);
  assert.equal(segments[0].endTime, 4.5);
});

test("merges a short scene deterministically", () => {
  const segments = createSegmentIntervals(5, [0.4, 3]);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].startTime, 0);
  assert.equal(segments[0].endTime, 3);
  assert.equal(segments[0].segmentationReason, "merged_short_segment");
});

test("uniformly splits scenes longer than the maximum", () => {
  const segments = createSegmentIntervals(31, []);
  assert.equal(segments.length, 3);
  assert.ok(segments.every((segment) => segment.duration <= 15.001));
  assert.ok(segments.every((segment) => segment.segmentationReason === "max_duration_split"));
});
