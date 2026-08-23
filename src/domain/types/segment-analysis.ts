import type { Score } from "./shared";

export type CameraBehavior = "static" | "pan" | "tilt" | "handheld" | "tracking" | "zoom" | "unknown";

export type AnalysisRole =
  | "hook"
  | "context"
  | "story_progression"
  | "reaction"
  | "conflict"
  | "reveal"
  | "transition"
  | "b_roll"
  | "ending"
  | "unclear";

export interface SegmentAnalysisResult {
  segmentId: string;
  visualDescription: string;
  scene: string;
  subjects: string[];
  actions: string[];
  cameraBehavior: CameraBehavior;
  visualQuality: Score;
  informationValue: Score;
  emotionalValue: Score;
  novelty: Score;
  audienceAppeal: Score;
  possibleRoles: AnalysisRole[];
  momentSummary: string;
  provider: string;
  model: string;
  analyzedAt: string;
}
