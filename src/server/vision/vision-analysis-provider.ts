import type { SegmentAnalysisResult } from "../../domain/types/index.ts";

export interface SegmentKeyframeInput {
  videoId: string;
  segmentId: string;
  timestamp: number;
  mimeType: "image/jpeg" | "image/png";
  data: string;
}

export interface AnalyzeSegmentInput {
  segmentId: string;
  videoId: string;
  startTime: number;
  endTime: number;
  keyframes: SegmentKeyframeInput[];
  priority?: "high" | "normal";
}

export interface VisionAnalysisProgressEvent { state: "attempt" | "retrying" | "switching_model" | "waiting" | "cooldown" | "active"; attempt?: number; maxAttempts?: number; category?: string; delayMs?: number; model?: string; previousModel?: string; active?: number; queued?: number; cooldownRemainingMs?: number; requestType?: string }

export interface VisionAnalysisProvider {
  readonly name: string;
  readonly model: string;
  analyzeSegment(input: AnalyzeSegmentInput, onProgress?: (event: VisionAnalysisProgressEvent) => void): Promise<SegmentAnalysisResult>;
}
