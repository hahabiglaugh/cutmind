import type { VideoSegment } from "@/domain/types";
import { CANDIDATE_FRAME_HEIGHT, CANDIDATE_FRAME_WIDTH, CANDIDATE_SAMPLE_RATIOS } from "./config";
import { brightnessQuality, frameDifference, sharpnessFromLuminance, type CandidateMetrics } from "./candidate-scoring";

export interface LocalCandidateMeasurement { metrics: CandidateMetrics; fingerprint: Uint8Array }

function waitForMetadata(video: HTMLVideoElement) { return new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("无法读取本地视频帧")); }); }
function seek(video: HTMLVideoElement, time: number) { return new Promise<void>((resolve, reject) => { const done = () => { cleanup(); resolve(); }; const fail = () => { cleanup(); reject(new Error("本地帧采样失败")); }; const cleanup = () => { video.removeEventListener("seeked", done); video.removeEventListener("error", fail); }; video.addEventListener("seeked", done, { once: true }); video.addEventListener("error", fail, { once: true }); video.currentTime = time; }); }
function luminanceFromRgba(data: Uint8ClampedArray) { const output = new Uint8Array(data.length / 4); for (let source = 0, target = 0; source < data.length; source += 4, target += 1) output[target] = Math.round(data[source] * 0.2126 + data[source + 1] * 0.7152 + data[source + 2] * 0.0722); return output; }
function compactFingerprint(luminance: Uint8Array) { const output = new Uint8Array(16 * 12); for (let y = 0; y < 12; y += 1) for (let x = 0; x < 16; x += 1) { let sum = 0; for (let dy = 0; dy < 3; dy += 1) for (let dx = 0; dx < 4; dx += 1) sum += luminance[(y * 3 + dy) * CANDIDATE_FRAME_WIDTH + x * 4 + dx]; output[y * 16 + x] = Math.round(sum / 12); } return output; }

export async function measureSegmentLocally(sourceUrl: string, segment: VideoSegment): Promise<LocalCandidateMeasurement> {
  const video = document.createElement("video"); video.preload = "auto"; video.muted = true; video.playsInline = true; video.src = sourceUrl;
  const canvas = document.createElement("canvas"); canvas.width = CANDIDATE_FRAME_WIDTH; canvas.height = CANDIDATE_FRAME_HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("浏览器不支持本地画面评分");
  try {
    await waitForMetadata(video);
    const frames: Uint8Array[] = [];
    for (const ratio of CANDIDATE_SAMPLE_RATIOS) { const timestamp = Math.min(segment.endTime - 0.01, segment.startTime + segment.duration * ratio); await seek(video, timestamp); context.drawImage(video, 0, 0, canvas.width, canvas.height); frames.push(luminanceFromRgba(context.getImageData(0, 0, canvas.width, canvas.height).data)); }
    const changes = [frameDifference(frames[0], frames[1]), frameDifference(frames[1], frames[2])];
    const rawChange = changes.reduce((sum, value) => sum + value, 0) / changes.length;
    const visualChangeScore = Math.min(100, Math.round(rawChange * 3.2));
    const motionScore = rawChange < 2 ? Math.round(rawChange * 8) : Math.max(0, Math.min(100, Math.round(100 - Math.abs(rawChange - 15) * 5)));
    const sharpnessScore = Math.round(frames.reduce((sum, frame) => sum + sharpnessFromLuminance(frame, canvas.width, canvas.height), 0) / frames.length);
    const meanBrightness = frames.reduce((frameSum, frame) => frameSum + frame.reduce((sum, value) => sum + value, 0) / frame.length, 0) / frames.length;
    return { metrics: { visualChangeScore, motionScore, sharpnessScore, brightnessScore: brightnessQuality(meanBrightness) }, fingerprint: compactFingerprint(frames[1]) };
  } finally { video.removeAttribute("src"); video.load(); canvas.width = 1; canvas.height = 1; }
}
