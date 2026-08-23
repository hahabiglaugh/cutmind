import type { StoryCandidate, VideoSegment } from "../types";

export interface StoryDiscoveryService {
  discover(segments: VideoSegment[]): Promise<StoryCandidate[]>;
  reevaluateSegments(story: StoryCandidate, segments: VideoSegment[]): Promise<VideoSegment[]>;
}
