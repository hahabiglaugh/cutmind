import type { VideoAsset, VideoSegment } from "../types";

export interface VideoProcessingService {
  readMetadata(source: File): Promise<VideoAsset>;
  segment(video: VideoAsset): Promise<VideoSegment[]>;
}
