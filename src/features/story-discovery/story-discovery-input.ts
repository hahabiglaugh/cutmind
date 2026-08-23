import type { SegmentAnalysisResult, SegmentCandidateScore, VideoSegment } from "@/domain/types";
import { MAX_STORY_DISCOVERY_SEGMENTS } from "./config.ts";

export interface StoryDiscoverySegmentInput {
  segmentId: string; videoAssetId: string; startTime: number; endTime: number; duration: number;
  candidateScore: number; candidateTier: "high" | "medium";
  momentSummary: string; visualDescription: string; scene: string; subjects: string[]; actions: string[];
  cameraBehavior: string; visualQuality: number; informationValue: number; emotionalValue: number; novelty: number; audienceAppeal: number; possibleRoles: string[];
}

function priority(item: StoryDiscoverySegmentInput) { return item.candidateScore * 0.35 + item.audienceAppeal * 0.2 + item.emotionalValue * 0.15 + item.informationValue * 0.12 + item.novelty * 0.1 + item.visualQuality * 0.08; }
function bucket(item: StoryDiscoverySegmentInput) {
  if (item.possibleRoles.some((role) => ["reaction", "conflict"].includes(role)) || item.subjects.some((subject) => /人物|人|游客|孩子|朋友|家人/.test(subject))) return "character";
  if (item.actions.length > 0) return "action";
  if (item.emotionalValue >= 65) return "emotion";
  if (item.subjects.length === 0 || item.possibleRoles.includes("context")) return "environment";
  if (item.informationValue >= 65) return "information";
  if (item.possibleRoles.some((role) => ["transition", "context"].includes(role))) return "transition";
  return "visual";
}

export function buildStoryDiscoveryInput(segments: VideoSegment[], scores: Record<string, SegmentCandidateScore>, analyses: Record<string, SegmentAnalysisResult>, limit = MAX_STORY_DISCOVERY_SEGMENTS) {
  const eligible: StoryDiscoverySegmentInput[] = segments.flatMap((segment) => {
    const score = scores[segment.id]; const analysis = analyses[segment.id];
    if (!score || !analysis || (score.tier !== "high" && score.tier !== "medium")) return [];
    return [{ segmentId: segment.id, videoAssetId: segment.videoId, startTime: segment.startTime, endTime: segment.endTime, duration: segment.duration, candidateScore: score.overallScore, candidateTier: score.tier, momentSummary: analysis.momentSummary, visualDescription: analysis.visualDescription, scene: analysis.scene, subjects: analysis.subjects, actions: analysis.actions, cameraBehavior: analysis.cameraBehavior, visualQuality: analysis.visualQuality, informationValue: analysis.informationValue, emotionalValue: analysis.emotionalValue, novelty: analysis.novelty, audienceAppeal: analysis.audienceAppeal, possibleRoles: analysis.possibleRoles }];
  });
  const groups = new Map<string, StoryDiscoverySegmentInput[]>();
  eligible.forEach((item) => { const key = bucket(item); groups.set(key, [...(groups.get(key) ?? []), item]); });
  groups.forEach((items) => items.sort((a, b) => priority(b) - priority(a)));
  const result: StoryDiscoverySegmentInput[] = []; const keys = ["character", "action", "environment", "emotion", "information", "transition", "visual"]; const selectedScenes = new Set<string>();
  while (result.length < limit && keys.some((key) => (groups.get(key)?.length ?? 0) > 0)) for (const key of keys) { const items = groups.get(key); if (!items?.length || result.length >= limit) continue; const diverseIndex = items.findIndex((item) => item.scene && !selectedScenes.has(item.scene)); const [item] = items.splice(diverseIndex >= 0 ? diverseIndex : 0, 1); result.push(item); if (item.scene) selectedScenes.add(item.scene); }
  return result;
}
