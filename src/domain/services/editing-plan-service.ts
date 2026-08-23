import type { EditingPlan, StoryCandidate, VideoSegment } from "../types";

export interface EditingPlanService {
  create(story: StoryCandidate, segments: VideoSegment[]): Promise<EditingPlan>;
}
