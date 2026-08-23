import type { VideoAsset } from "@/domain/types";

export const ACCEPTED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
export const MAX_VIDEO_FILES = 30;

export interface LocalVideoRuntime {
  file: File;
  previewUrl: string;
  thumbnailUrl: string | null;
}

export interface LocalVideoEntry {
  asset: VideoAsset;
  runtime: LocalVideoRuntime;
}

export function fileFingerprint(file: File): string { return `${file.name}:${file.size}:${file.lastModified}`; }
export function isAcceptedVideo(file: File): boolean {
  if (ACCEPTED_VIDEO_TYPES.has(file.type)) return true;
  return /\.(mp4|mov|webm)$/i.test(file.name) && file.type === "";
}

export function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${remainingSeconds}s`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function readVideoMetadata(url: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let settled = false;
    const cleanup = () => { window.clearTimeout(timeout); video.onloadedmetadata = null; video.onerror = null; video.removeAttribute("src"); video.load(); };
    const finish = (callback: () => void) => { if (settled) return; settled = true; cleanup(); callback(); };
    const timeout = window.setTimeout(() => finish(() => reject(new Error("读取视频信息超时"))), 20_000);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0 || video.videoWidth <= 0 || video.videoHeight <= 0) {
        finish(() => reject(new Error("视频 metadata 不完整或无法解码")));
        return;
      }
      const metadata = { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
      finish(() => resolve(metadata));
    };
    video.onerror = () => finish(() => reject(new Error("浏览器无法读取此视频，请检查文件或编码格式")));
    video.src = url;
  });
}

export function createVideoThumbnail(url: string, duration: number): Promise<string> {
  return createVideoThumbnailAt(url, Math.min(duration * 0.2, 3, Math.max(0, duration - 0.05)));
}

export function createVideoThumbnailAt(url: string, time: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let settled = false;
    const cleanup = () => { window.clearTimeout(timeout); video.onloadedmetadata = null; video.onseeked = null; video.onerror = null; video.removeAttribute("src"); video.load(); };
    const finish = (callback: () => void) => { if (settled) return; settled = true; cleanup(); callback(); };
    const timeout = window.setTimeout(() => finish(() => reject(new Error("生成缩略图超时"))), 20_000);
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => { video.currentTime = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05)); };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 960 / video.videoWidth);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) { finish(() => reject(new Error("浏览器不支持缩略图画布"))); return; }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) { finish(() => reject(new Error("无法编码缩略图"))); return; }
        const thumbnailUrl = URL.createObjectURL(blob);
        finish(() => resolve(thumbnailUrl));
      }, "image/jpeg", 0.82);
    };
    video.onerror = () => finish(() => reject(new Error("无法解码缩略图帧")));
    video.src = url;
  });
}
