import type { EditingPace, EditingPlan, EditingPlanItem, EditingPlanRole, StoryBeatType } from "../../domain/types/index.ts";
import type { EditingPlanInput } from "./editing-plan-input.ts";
import { MIN_EDITING_CLIP_DURATION } from "./config.ts";

const roleMap: Record<StoryBeatType, EditingPlanRole> = { hook: "hook", setup: "setup", development: "story_progression", contrast: "contrast", peak: "peak", transition: "transition", ending: "ending" };
const paceFor = (role: EditingPlanRole): EditingPace => role === "hook" || role === "transition" ? "fast" : role === "ending" ? "slow" : "medium";
const round = (value: number) => Math.round(value * 100) / 100;

export function generateLocalEditingPlan(input: EditingPlanInput): EditingPlan {
  const sources = new Map(input.segments.map((segment) => [segment.segmentId, segment])); const refs = new Map(input.story.segmentRefs?.map((ref) => [ref.segmentId, ref]) ?? []); const beatBySegment = new Map<string, { type?: StoryBeatType; description?: string }>(); const orderedIds: string[] = [];
  for (const beat of input.story.structure) for (const id of beat.segmentRefs ?? beat.segmentIds ?? []) { if (!beatBySegment.has(id)) beatBySegment.set(id, { type: beat.type, description: beat.description ?? beat.purpose }); if (!orderedIds.includes(id)) orderedIds.push(id); }
  for (const segment of input.segments) if (!orderedIds.includes(segment.segmentId)) orderedIds.push(segment.segmentId);
  let cursor = 0; const timelineItems: EditingPlanItem[] = orderedIds.map((segmentId) => { const source = sources.get(segmentId); if (!source) throw new Error(`Unknown story segment: ${segmentId}`); if (source.duration < MIN_EDITING_CLIP_DURATION) throw new Error(`Segment ${segmentId} is shorter than ${MIN_EDITING_CLIP_DURATION}s`); const ref = refs.get(segmentId); const beat = beatBySegment.get(segmentId); const beatType = beat?.type ?? ref?.role ?? "development"; const role = roleMap[beatType]; const duration = round(source.segmentEnd - source.segmentStart); const timelineStart = round(cursor); const timelineEnd = round(cursor + duration); cursor = timelineEnd; return { id: crypto.randomUUID(), segmentId, sourceVideoId: source.sourceVideoId, sourceStart: source.segmentStart, sourceEnd: source.segmentEnd, timelineStart, timelineEnd, duration, role, reason: ref?.reason ?? beat?.description ?? `用于故事的${beatType}段落`, narration: null, subtitle: null, editingNote: "保留当前 Segment 的完整有效范围。", transitionSuggestion: null, pace: paceFor(role), storyBeat: beatType }; });
  if (!timelineItems.length) throw new Error("所选故事没有可用 Segment。"); return { id: crypto.randomUUID(), storyId: input.story.id, title: `${input.story.title} · 剪辑方案`, totalDuration: cursor, estimatedFinalDuration: cursor, timelineItems, createdAt: new Date().toISOString(), provider: "local", model: "story-structure" };
}
