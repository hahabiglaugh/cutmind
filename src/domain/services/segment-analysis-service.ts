import type { VideoAsset, VideoSegment } from "../types";

export interface SegmentAnalysisService {
  analyze(segment: VideoSegment, source: VideoAsset): Promise<VideoSegment>;
  analyzeBatch(segments: VideoSegment[], sources: VideoAsset[]): Promise<VideoSegment[]>;
}
