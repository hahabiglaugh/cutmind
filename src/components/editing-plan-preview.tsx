"use client";

import { useEffect, useRef, useState } from "react";
import { useProjectSession } from "@/features/project/project-session-context";
import { nextPreviewIndex } from "@/features/editing-plan/preview-sequence";

export function EditingPlanPreview() {
  const { editingPlan, runtimeUrls } = useProjectSession(); const videoRef = useRef<HTMLVideoElement>(null); const [index, setIndex] = useState(0); const [playing, setPlaying] = useState(false);
  const items = editingPlan?.timelineItems ?? []; const item = items[index]; const sourceUrl = item ? runtimeUrls[item.sourceVideoId]?.previewUrl : undefined;
  useEffect(() => { setIndex(0); setPlaying(false); }, [editingPlan?.id]);
  useEffect(() => { const video = videoRef.current; if (!video || !item) return; video.currentTime = item.sourceStart; if (playing) void video.play(); }, [index, item, playing]);
  if (!editingPlan || !item) return null;
  const play = () => { const video = videoRef.current; if (!video || !sourceUrl) return; if (video.currentTime < item.sourceStart || video.currentTime >= item.sourceEnd) video.currentTime = item.sourceStart; setPlaying(true); void video.play(); };
  const pause = () => { setPlaying(false); videoRef.current?.pause(); };
  const replay = () => { setIndex(0); setPlaying(true); const video = videoRef.current; if (video && index === 0) { video.currentTime = items[0].sourceStart; void video.play(); } };
  const advance = () => { const next = nextPreviewIndex(index, items.length); if (next === null) { setPlaying(false); videoRef.current?.pause(); } else setIndex(next); };
  return <section className="mt-4 border border-black/10 bg-[var(--paper)] p-6 md:p-8"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Editing Plan Preview</p><h2 className="mt-3 text-2xl font-medium">预览剪辑</h2></div><p className="font-mono text-sm">{index + 1} / {items.length}</p></div><div className="mt-5 aspect-video bg-black">{sourceUrl ? <video className="h-full w-full" ref={videoRef} src={sourceUrl} playsInline onLoadedMetadata={(event) => { event.currentTarget.currentTime = item.sourceStart; if (playing) void event.currentTarget.play(); }} onTimeUpdate={(event) => { if (event.currentTarget.currentTime >= item.sourceEnd) advance(); }} onEnded={advance} /> : <div className="flex h-full items-center justify-center text-sm text-white/60">本地视频引用不可用</div>}</div><div className="mt-4 flex gap-3"><button className="bg-[var(--ink)] px-5 py-2 text-sm text-white" onClick={playing ? pause : play} type="button">{playing ? "暂停" : "播放"}</button><button className="border border-black/15 px-5 py-2 text-sm" onClick={replay} type="button">重新播放</button></div><p className="mt-3 font-mono text-[10px] text-black/35">原片 {item.sourceStart.toFixed(1)}s → {item.sourceEnd.toFixed(1)}s</p></section>;
}
