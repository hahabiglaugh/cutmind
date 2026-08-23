"use client";

import { useRef, useState } from "react";

interface UploadDropzoneProps {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}

export function UploadDropzone({ disabled = false, onFiles }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const chooseFiles = () => { if (!disabled) inputRef.current?.click(); };

  return (
    <label
      aria-disabled={disabled}
      className={`group relative flex min-h-[280px] flex-col items-center justify-center border border-dashed px-6 text-center transition-colors md:min-h-[320px] ${disabled ? "cursor-not-allowed border-black/10 opacity-50" : isDragging ? "cursor-copy border-[var(--accent)] bg-white/45" : "cursor-pointer border-black/25 bg-[var(--paper)] hover:border-[var(--accent)]"}`}
      htmlFor="initial-video-files"
      onDragEnter={(event) => { event.preventDefault(); if (!disabled) setIsDragging(true); }}
      onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setIsDragging(false); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? "none" : "copy"; }}
      onDrop={(event) => { event.preventDefault(); setIsDragging(false); if (!disabled) onFiles(Array.from(event.dataTransfer.files)); }}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") chooseFiles(); }}
      role="button"
      tabIndex={disabled ? -1 : 0}
    >
      <input id="initial-video-files" ref={inputRef} className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" multiple disabled={disabled} onChange={(event) => { onFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ink)] text-2xl text-white transition-transform group-hover:-translate-y-1">↑</span>
      <h3 className="text-2xl font-medium tracking-[-0.04em]">{isDragging ? "松开以加入素材" : "上传素材"}</h3>
      <p className="mt-3 text-sm text-black/45">拖放视频到这里，或点击选择文件</p>
      <p className="mt-8 text-[11px] uppercase tracking-[0.15em] text-black/30">MP4 · MOV · WEBM / 最多 30 个</p>
    </label>
  );
}
