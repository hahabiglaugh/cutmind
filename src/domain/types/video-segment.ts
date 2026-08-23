import type { ProcessingStatus, Score, Seconds } from "./shared";

export type SegmentationReason =
  | "scene_boundary"
  | "max_duration_split"
  | "merged_short_segment";

export type SegmentRole =
  | "hook"
  | "context"
  | "conflict"
  | "reaction"
  | "transition"
  | "b-roll"
  | "ending";

export interface VideoSegment {
  id: string;
  videoId: string;
  startTime: Seconds;
  endTime: Seconds;
  duration: Seconds;
  segmentationReason: SegmentationReason;
  transcript: string | null;
  visualDescription: string | null;
  scene: string | null;
  subjects: string[];
  actions: string[];
  visualQuality: Score | null;
  informationValue: Score | null;
  emotionalValue: Score | null;
  novelty: Score | null;
  audienceAppeal: Score | null;
  possibleRoles: SegmentRole[];
  status: ProcessingStatus;
}
