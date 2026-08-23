import type { Seconds } from "./shared";
export type EditingPlanRole = "hook" | "setup" | "context" | "story_progression" | "reaction" | "contrast" | "reveal" | "transition" | "b_roll" | "peak" | "ending";
export type EditingPace = "fast" | "medium" | "slow";

export interface EditingPlanItem {
  id: string;
  segmentId: string;
  sourceVideoId: string;
  sourceStart: Seconds;
  sourceEnd: Seconds;
  timelineStart: Seconds;
  timelineEnd: Seconds;
  duration: Seconds;
  role: EditingPlanRole;
  reason: string;
  narration: string | null;
  subtitle: string | null;
  editingNote: string | null;
  transitionSuggestion: string | null;
  pace: EditingPace;
  storyBeat: string;
}

export interface EditingPlan {
  id: string;
  storyId: string;
  title: string;
  totalDuration: Seconds;
  estimatedFinalDuration: Seconds;
  timelineItems: EditingPlanItem[];
  createdAt: string;
  provider: string;
  model: string;
}
