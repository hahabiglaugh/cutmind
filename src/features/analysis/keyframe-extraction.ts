import type { VideoSegment } from "@/domain/types";
import type { SegmentKeyframeInput } from "@/server/vision/vision-analysis-provider";
import { KEYFRAME_JPEG_QUALITY, KEYFRAME_MAX_EDGE } from "./config.ts";

export function selectKeyframeTimestamps(segment: Pick<VideoSegment, "startTime" | "endTime" | "duration">) {
  const ratios = segment.duration <= 3 ? [0.5] : [0.25, 0.75];
  return ratios.map((ratio) => Math.min(segment.endTime - 0.01, segment.startTime + segment.duration * ratio));
}

function seek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("无法读取关键帧。")); };
    const cleanup = () => { video.removeEventListener("seeked", done); video.removeEventListener("error", fail); };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", fail, { once: true });
    video.currentTime = time;
  });
}

export async function extractSegmentKeyframes(sourceUrl: string, segment: VideoSegment, onProgress?: (completed: number, total: number) => void): Promise<SegmentKeyframeInput[]> {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = sourceUrl;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("无法打开本地视频以提取关键帧。"));
  });
  const timestamps = selectKeyframeTimestamps(segment);
  const scale = Math.min(1, KEYFRAME_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持 Canvas 关键帧提取。具体可稍后重试。");
  const frames: SegmentKeyframeInput[] = [];
  try {
    for (const timestamp of timestamps) {
      await seek(video, timestamp);
      context.drawImage(video, 0, 0, width, height);
      frames.push({ videoId: segment.videoId, segmentId: segment.id, timestamp, mimeType: "image/jpeg", data: canvas.toDataURL("image/jpeg", KEYFRAME_JPEG_QUALITY).split(",")[1] });
      onProgress?.(frames.length, timestamps.length);
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
    canvas.width = 1;
    canvas.height = 1;
  }
}
