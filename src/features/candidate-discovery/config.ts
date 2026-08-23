import type { CandidateTier } from "@/domain/types";

export const LOCAL_SCORING_CONCURRENCY = 4;
export const MAX_AUTO_AI_CANDIDATES = 60;
export const CANDIDATE_FRAME_WIDTH = 64;
export const CANDIDATE_FRAME_HEIGHT = 36;
export const CANDIDATE_SAMPLE_RATIOS = [0.2, 0.5, 0.8] as const;
export const CANDIDATE_METRIC_WEIGHTS = { visualChangeScore: 0.25, motionScore: 0.20, sharpnessScore: 0.20, brightnessScore: 0.10, stabilityScore: 0.10, facePresenceScore: 0.10, compositionScore: 0.05 } as const;
export const CANDIDATE_TIER_THRESHOLDS: Array<{ tier: CandidateTier; minimum: number }> = [{ tier: "high", minimum: 75 }, { tier: "medium", minimum: 55 }, { tier: "low", minimum: 35 }, { tier: "archive", minimum: 0 }];
