import type { SegmentationReason } from "../../domain/types/video-segment";
import { MAX_SEGMENT_DURATION, MIN_SEGMENT_DURATION } from "./config.ts";

export interface SegmentInterval {
  startTime: number;
  endTime: number;
  duration: number;
  segmentationReason: SegmentationReason;
}

const roundTime = (value: number) => Math.round(value * 1000) / 1000;

export function createSegmentIntervals(
  duration: number,
  rawBoundaries: number[],
  minDuration = MIN_SEGMENT_DURATION,
  maxDuration = MAX_SEGMENT_DURATION,
): SegmentInterval[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const boundaries = [...new Set(rawBoundaries
    .filter((time) => Number.isFinite(time) && time > 0 && time < duration)
    .map(roundTime))]
    .sort((a, b) => a - b);
  const points = [0, ...boundaries, duration];
  const scenes: SegmentInterval[] = points.slice(0, -1).map((startTime, index) => ({
    startTime,
    endTime: points[index + 1],
    duration: points[index + 1] - startTime,
    segmentationReason: "scene_boundary",
  }));

  const merged: SegmentInterval[] = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    if (scene.duration >= minDuration) {
      merged.push(scene);
      continue;
    }
    if (merged.length > 0) {
      const previous = merged[merged.length - 1];
      previous.endTime = scene.endTime;
      previous.duration = previous.endTime - previous.startTime;
      previous.segmentationReason = "merged_short_segment";
    } else if (scenes[index + 1]) {
      scenes[index + 1].startTime = scene.startTime;
      scenes[index + 1].duration = scenes[index + 1].endTime - scene.startTime;
      scenes[index + 1].segmentationReason = "merged_short_segment";
    } else {
      merged.push(scene);
    }
  }

  return merged.flatMap((scene) => {
    if (scene.duration <= maxDuration) return [{ ...scene, startTime: roundTime(scene.startTime), endTime: roundTime(scene.endTime), duration: roundTime(scene.duration) }];
    const partCount = Math.ceil(scene.duration / maxDuration);
    const partDuration = scene.duration / partCount;
    return Array.from({ length: partCount }, (_, index) => {
      const startTime = scene.startTime + partDuration * index;
      const endTime = index === partCount - 1 ? scene.endTime : scene.startTime + partDuration * (index + 1);
      return { startTime: roundTime(startTime), endTime: roundTime(endTime), duration: roundTime(endTime - startTime), segmentationReason: "max_duration_split" as const };
    });
  });
}
