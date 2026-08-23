import type { Score, Seconds } from "./shared";
import type { SegmentRole } from "./video-segment";

export type StoryType = "emotional" | "informational" | "experience" | "aesthetic" | "character" | "discovery" | "mixed";
export type StoryBeatType = "hook" | "setup" | "development" | "contrast" | "peak" | "transition" | "ending";

export interface StorySegmentRef {
  segmentId: string;
  role: StoryBeatType;
  reason: string;
  suggestedStartTime: Seconds;
  suggestedEndTime: Seconds;
}

export interface StoryStructureItem {
  order?: number;
  role?: SegmentRole;
  purpose?: string;
  segmentIds?: string[];
  type?: StoryBeatType;
  description?: string;
  segmentRefs?: string[];
}

export interface StoryCandidate {
  id: string;
  title: string;
  angle: string;
  hook: string;
  summary: string;
  score: Score;
  reasons: string[];
  targetAudience: string;
  recommendedSegmentIds: string[];
  structure: StoryStructureItem[];
  estimatedDuration: Seconds;
  concept?: string;
  storyType?: StoryType;
  coreIdea?: string;
  targetViewerValue?: string[];
  segmentRefs?: StorySegmentRef[];
  whyItWorks?: string;
  confidence?: Score;
  createdAt?: string;
  provider?: string;
  model?: string;
  analysisCoverage?: {
    analyzedSegments: number;
    candidateSegments: number;
    coverageRatio: number;
  };
}
