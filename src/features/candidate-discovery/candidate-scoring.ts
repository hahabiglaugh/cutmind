import type { CandidateTier, SegmentCandidateScore } from "@/domain/types";
import { CANDIDATE_METRIC_WEIGHTS, CANDIDATE_TIER_THRESHOLDS, MAX_AUTO_AI_CANDIDATES } from "./config.ts";

type MetricName = keyof typeof CANDIDATE_METRIC_WEIGHTS;
export type CandidateMetrics = Partial<Record<MetricName, number>>;
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const rounded = (value: number) => Math.round(clamp(value));

export function tierForScore(score: number): CandidateTier { return CANDIDATE_TIER_THRESHOLDS.find(({ minimum }) => score >= minimum)?.tier ?? "archive"; }
export function brightnessQuality(meanLuminance: number) { return rounded(100 - Math.abs(meanLuminance - 128) * 0.92); }
export function sharpnessFromLuminance(luminance: Uint8Array, width: number, height: number) {
  if (width < 3 || height < 3) return 0;
  let sum = 0; let sumSquares = 0; let count = 0;
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) { const index = y * width + x; const laplacian = 4 * luminance[index] - luminance[index - 1] - luminance[index + 1] - luminance[index - width] - luminance[index + width]; sum += laplacian; sumSquares += laplacian * laplacian; count += 1; }
  return rounded(Math.sqrt(Math.max(0, sumSquares / count - (sum / count) ** 2)) * 2.2);
}
export function frameDifference(first: Uint8Array, second: Uint8Array) { const length = Math.min(first.length, second.length); if (!length) return 0; let difference = 0; for (let index = 0; index < length; index += 1) difference += Math.abs(first[index] - second[index]); return (difference / length / 255) * 100; }
export function fingerprintSimilarity(first: Uint8Array, second: Uint8Array) { return 1 - frameDifference(first, second) / 100; }
export function duplicatePenaltyForSimilarity(similarity: number) { return similarity <= 0.92 ? 0 : rounded(((similarity - 0.92) / 0.08) * 18); }

export function scoreCandidate(segmentId: string, metrics: CandidateMetrics, duplicatePenalty = 0, scoredAt = new Date().toISOString()): SegmentCandidateScore {
  const entries = Object.entries(metrics).filter((entry): entry is [MetricName, number] => Number.isFinite(entry[1]));
  const availableWeight = entries.reduce((sum, [name]) => sum + CANDIDATE_METRIC_WEIGHTS[name], 0);
  const weighted = availableWeight > 0 ? entries.reduce((sum, [name, value]) => sum + clamp(value) * CANDIDATE_METRIC_WEIGHTS[name], 0) / availableWeight : 0;
  const visualChange = metrics.visualChangeScore; const motion = metrics.motionScore;
  const staticPenalty = visualChange !== undefined && motion !== undefined && visualChange < 12 && motion < 20 ? rounded((1 - Math.max(visualChange / 12, motion / 20)) * 20) : 0;
  const overallScore = rounded(weighted - duplicatePenalty - staticPenalty); const reasons: string[] = [];
  if ((metrics.sharpnessScore ?? 0) >= 65) reasons.push("画面较清晰"); if ((metrics.brightnessScore ?? 0) >= 70) reasons.push("曝光较正常"); if ((metrics.visualChangeScore ?? 0) >= 55) reasons.push("画面变化明显"); if ((metrics.motionScore ?? 0) >= 55) reasons.push("镜头有适度运动");
  reasons.push(duplicatePenalty > 0 ? "与附近素材较相似" : "与附近素材差异较大"); if (staticPenalty > 0) reasons.push("画面变化较少");
  const totalWeight = Object.values(CANDIDATE_METRIC_WEIGHTS).reduce((sum, value) => sum + value, 0);
  return { segmentId, overallScore, ...metrics, duplicatePenalty, staticPenalty, confidence: Math.round((availableWeight / totalWeight) * 100) / 100, reasons, tier: tierForScore(overallScore), scoredAt };
}
export function selectAutomaticCandidates<T extends { id: string }>(segments: T[], scores: Record<string, SegmentCandidateScore>, limit = MAX_AUTO_AI_CANDIDATES) { return segments.filter((segment) => ["high", "medium"].includes(scores[segment.id]?.tier)).sort((a, b) => scores[b.id].overallScore - scores[a.id].overallScore).slice(0, limit); }
