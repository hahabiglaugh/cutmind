"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { VideoAsset } from "@/domain/types";
import { formatDuration, formatFileSize, MAX_VIDEO_FILES } from "@/features/materials/local-video";
import { useProjectSession } from "@/features/project/project-session-context";
import { UploadDropzone } from "./upload-dropzone";

export function MaterialsWorkspace() {
  const { assets, runtimeUrls, notice, addFiles, removeAsset } = useProjectSession();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const summary = useMemo(() => ({
    count: assets.length,
    ready: assets.filter((asset) => asset.status === "ready").length,
    processing: assets.filter((asset) => asset.status === "selected" || asset.status === "reading_metadata").length,
    errors: assets.filter((asset) => asset.status === "error").length,
    duration: assets.reduce((sum, asset) => sum + (asset.duration ?? 0), 0),
    size: assets.reduce((sum, asset) => sum + asset.fileSize, 0),
  }), [assets]);
  const previewAsset = previewId ? assets.find((asset) => asset.id === previewId) : undefined;
  const previewRuntime = previewId ? runtimeUrls[previewId] : undefined;

  return (
    <div>
      {assets.length === 0 ? <UploadDropzone onFiles={addFiles} /> : (
        <>
          <div className="grid gap-px border border-black/10 bg-black/10 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="素材" value={`${summary.count} 个`} /><Stat label="总时长" value={formatDuration(summary.duration)} /><Stat label="总大小" value={formatFileSize(summary.size)} /><Stat label="Ready" value={`${summary.ready}`} /><Stat label="Error" value={`${summary.errors}`} />
          </div>
          <div className="mt-8 flex flex-col gap-4 border-b border-black/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs uppercase tracking-[0.16em] text-black/35">Material / Footage list</p><h3 className="mt-2 text-3xl font-medium tracking-[-0.045em]">{summary.processing > 0 ? `正在读取 ${summary.processing} 个素材…` : `${summary.ready} 个素材已准备好`}</h3></div>
            <label className={`border border-black/15 px-4 py-2.5 text-sm transition-colors ${summary.count >= MAX_VIDEO_FILES ? "cursor-not-allowed opacity-35" : "cursor-pointer hover:border-black/50"}`} htmlFor="more-videos">+ 添加素材</label>
            <input id="more-videos" className="sr-only" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" multiple disabled={summary.count >= MAX_VIDEO_FILES} onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
          </div>
          <div className="divide-y divide-black/10">
            {assets.map((asset, index) => <MaterialRow key={asset.id} asset={asset} index={index} thumbnailUrl={runtimeUrls[asset.id]?.thumbnailUrl ?? null} onPreview={() => setPreviewId(asset.id)} onRemove={() => { removeAsset(asset); setPreviewId((current) => current === asset.id ? null : current); }} />)}
          </div>
          {summary.ready > 0 && summary.processing === 0 && <div className="mt-10 flex flex-col items-start justify-between gap-5 border-t border-black/10 pt-8 sm:flex-row sm:items-center"><p className="max-w-lg text-sm leading-6 text-black/45">素材已在当前浏览器会话中准备好。下一步将在本地检测镜头边界，不会调用云端 AI。</p><Link className="bg-[var(--ink)] px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-[var(--accent)]" href="/project/local-session">开始视频切片 →</Link></div>}
        </>
      )}
      {notice && <div className="mt-4 border-l-2 border-[var(--accent)] bg-white/35 px-4 py-3 text-sm text-black/60" role="status">{notice}</div>}
      {previewAsset && previewRuntime && <div aria-label={`${previewAsset.fileName} 预览`} aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 md:p-10" role="dialog" onClick={() => setPreviewId(null)}><div className="w-full max-w-5xl" onClick={(event) => event.stopPropagation()}><div className="mb-3 flex items-center justify-between text-white"><span className="max-w-[75%] truncate text-sm">{previewAsset.fileName}</span><button className="px-3 py-2 text-sm text-white/70 hover:text-white" onClick={() => setPreviewId(null)} type="button">关闭 ×</button></div><video className="max-h-[78vh] w-full bg-black" controls playsInline src={previewRuntime.previewUrl} /></div></div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="bg-[var(--surface)] px-4 py-4"><p className="text-[10px] uppercase tracking-[0.15em] text-black/35">{label}</p><p className="mt-2 text-lg font-medium">{value}</p></div>; }

function MaterialRow({ asset, index, thumbnailUrl, onPreview, onRemove }: { asset: VideoAsset; index: number; thumbnailUrl: string | null; onPreview: () => void; onRemove: () => void }) {
  const status = asset.status === "reading_metadata" || asset.status === "selected" ? "Processing" : asset.status === "ready" ? "Ready" : "Error";
  return <article className="grid gap-4 py-5 md:grid-cols-[3rem_10rem_1fr_auto] md:items-center"><span className="hidden font-mono text-xs text-black/25 md:block">{String(index + 1).padStart(2, "0")}</span><div className="relative aspect-video overflow-hidden bg-black/10" style={thumbnailUrl ? { backgroundImage: `url(${thumbnailUrl})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}>{!thumbnailUrl && <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-[0.12em] text-black/30">{asset.status === "error" ? "No preview" : asset.status === "ready" ? "Thumbnail unavailable" : "Reading…"}</div>}{asset.duration !== null && <span className="absolute bottom-1.5 right-1.5 bg-black/75 px-1.5 py-1 text-[10px] text-white">{formatDuration(asset.duration)}</span>}</div><div className="min-w-0"><h4 className="truncate text-base font-medium" title={asset.fileName}>{asset.fileName}</h4><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-black/40"><span>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : "Resolution —"}</span><span>{formatFileSize(asset.fileSize)}</span><span>{asset.fileType || "Unknown type"}</span></div>{asset.error && <p className="mt-2 text-xs text-[var(--accent)]">{asset.error}</p>}</div><div className="flex items-center justify-between gap-3 md:justify-end"><span className={`mr-2 text-xs ${asset.status === "error" ? "text-[var(--accent)]" : "text-black/40"}`}><span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${asset.status === "ready" ? "bg-emerald-600" : asset.status === "error" ? "bg-[var(--accent)]" : "animate-pulse bg-amber-500"}`} />{status}</span><button className="text-xs text-black/55 underline-offset-4 hover:underline disabled:opacity-30" disabled={asset.status !== "ready"} onClick={onPreview} type="button">Preview</button><button className="text-xs text-black/55 underline-offset-4 hover:text-[var(--accent)] hover:underline" onClick={onRemove} type="button">Remove</button></div></article>;
}
