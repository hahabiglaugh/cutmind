import { FRAME_SAMPLE_INTERVAL, SCENE_THRESHOLD } from "./config";

export interface SceneDetectionResult {
  boundaries: number[];
  sampledFrames: number;
  threshold: number;
}

export interface FrameSamplingProgress {
  processedFrames: number;
  totalFrames: number;
}

const seek = (video: HTMLVideoElement, time: number) => new Promise<void>((resolve, reject) => {
  const timeout = window.setTimeout(() => finish(() => reject(new Error("视频帧 seek 超时"))), 15_000);
  const finish = (callback: () => void) => {
    window.clearTimeout(timeout);
    video.onseeked = null;
    video.onerror = null;
    callback();
  };
  video.onseeked = () => finish(resolve);
  video.onerror = () => finish(() => reject(new Error("视频帧解码失败")));
  video.currentTime = time;
});

function colorHistogram(context: CanvasRenderingContext2D, width: number, height: number): Float32Array {
  const pixels = context.getImageData(0, 0, width, height).data;
  const bins = new Float32Array(48);
  const pixelCount = pixels.length / 4;
  for (let index = 0; index < pixels.length; index += 4) {
    bins[Math.floor(pixels[index] / 16)] += 1;
    bins[16 + Math.floor(pixels[index + 1] / 16)] += 1;
    bins[32 + Math.floor(pixels[index + 2] / 16)] += 1;
  }
  for (let index = 0; index < bins.length; index += 1) bins[index] /= pixelCount;
  return bins;
}

function histogramDistance(left: Float32Array, right: Float32Array): number {
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) distance += Math.abs(left[index] - right[index]);
  return distance / 6;
}

export async function detectSceneBoundaries(
  sourceUrl: string,
  duration: number,
  threshold = SCENE_THRESHOLD,
  sampleInterval = FRAME_SAMPLE_INTERVAL,
  onProgress?: (progress: FrameSamplingProgress) => void,
): Promise<SceneDetectionResult> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = sourceUrl;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(() => reject(new Error("场景检测无法加载视频"))), 20_000);
    const finish = (callback: () => void) => { window.clearTimeout(timeout); video.onloadedmetadata = null; video.onerror = null; callback(); };
    video.onloadedmetadata = () => finish(resolve);
    video.onerror = () => finish(() => reject(new Error("浏览器不支持此视频编码")));
  });

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 36;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器无法创建场景检测画布");
  const boundaries: number[] = [];
  let previous: Float32Array | null = null;
  let sampledFrames = 0;
  const totalFrames = Math.ceil(duration / sampleInterval);
  onProgress?.({ processedFrames: 0, totalFrames });

  try {
    for (let time = 0; time < duration; time += sampleInterval) {
      await seek(video, Math.min(time, Math.max(0, duration - 0.01)));
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const current = colorHistogram(context, canvas.width, canvas.height);
      if (previous && histogramDistance(previous, current) >= threshold) boundaries.push(Math.round(time * 1000) / 1000);
      previous = current;
      sampledFrames += 1;
      onProgress?.({ processedFrames: sampledFrames, totalFrames });
      if (sampledFrames % 12 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  } finally {
    video.removeAttribute("src");
    video.load();
  }
  return { boundaries, sampledFrames, threshold };
}
