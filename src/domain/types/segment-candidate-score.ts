export type CandidateTier = "high" | "medium" | "low" | "archive";

export interface SegmentCandidateScore {
  segmentId: string;
  overallScore: number;
  visualChangeScore?: number;
  motionScore?: number;
  sharpnessScore?: number;
  brightnessScore?: number;
  stabilityScore?: number;
  facePresenceScore?: number;
  compositionScore?: number;
  duplicatePenalty: number;
  staticPenalty: number;
  confidence: number;
  reasons: string[];
  tier: CandidateTier;
  scoredAt: string;
}
