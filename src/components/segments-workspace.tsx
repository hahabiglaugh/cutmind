"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SegmentationReason, SegmentAnalysisResult, SegmentCandidateScore, VideoAsset, VideoSegment } from "@/domain/types";
import { useProjectSession, segmentationConfig, type CandidateDiscoveryState, type SegmentAnalysisJob, type SegmentationJob } from "@/features/project/project-session-context";
import { analysisRoleLabels, cameraBehaviorLabels } from "@/features/analysis/ui-labels";
import { candidateTierLabels } from "@/features/candidate-discovery/ui-labels";
import { MAX_AUTO_AI_CANDIDATES } from "@/features/candidate-discovery/config";
import { StoryDiscoveryPanel } from "@/components/story-discovery-panel";
import { EditingPlanPanel } from "@/components/editing-plan-panel";
import { EditingPlanPreview } from "@/components/editing-plan-preview";

const reasonLabels: Record<SegmentationReason, string> = { scene_boundary: "Scene boundary", max_duration_split: "Max duration split", merged_short_segment: "Merged short segment" };
const activeStatuses = new Set(["reading", "sampling_frames", "detecting_scenes", "creating_segments", "generating_thumbnails"]);

const defaultJob = (asset: VideoAsset): SegmentationJob => asset.status === "error"
  ? { status: "error", progress: 1, error: asset.error }
  : asset.status === "reading_metadata" || asset.status === "selected"
    ? { status: "reading", progress: 0 }
    : { status: "waiting", progress: 0 };

function preciseTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${remaining.toFixed(2).padStart(5, "0")}`;
}

export function SegmentsWorkspace({ projectId }: { projectId: string }) {
  const { assets, runtimeUrls, segmentsByVideo, segmentThumbnailUrls, segmentationJobs, segmentAll, analysesBySegment, analysisJobs, aiConfiguration, analyzeAllSegments, reanalyzeSegment, candidateScores, candidateDiscovery, discoverCandidates, selectedStoryCandidateId } = useProjectSession();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [previewSegment, setPreviewSegment] = useState<VideoSegment | null>(null);
  useEffect(() => { void segmentAll(); }, [segmentAll]);

  if (assets.length === 0) return <main className="flex min-h-screen items-center justify-center bg-[var(--paper)] px-6 text-[var(--ink)]"><div className="max-w-xl text-center"><p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">Local session</p><h1 className="mt-5 text-5xl font-medium tracking-[-0.055em]">当前没有可处理的素材。</h1><p className="mt-5 leading-7 text-black/45">本地文件只保存在浏览器会话中。请返回并选择视频。</p><Link className="mt-8 inline-block bg-[var(--ink)] px-6 py-3 text-sm text-white" href="/">返回上传素材</Link></div></main>;

  const jobs = assets.map((asset) => ({ asset, job: segmentationJobs[asset.id] ?? defaultJob(asset) }));
  const readyJobs = jobs.filter(({ job }) => job.status === "ready").length;
  const errorJobs = jobs.filter(({ job }) => job.status === "error").length;
  const processingJobs = jobs.filter(({ job }) => activeStatuses.has(job.status)).length;
  const readyAssets = assets.filter((asset) => asset.status === "ready").length;
  const totalSegments = Object.values(segmentsByVideo).reduce((sum, segments) => sum + segments.length, 0);
  const overallProgress = assets.length > 0 ? jobs.reduce((sum, { job }) => sum + job.progress, 0) / assets.length : 0;
  const activeJob = jobs.find(({ job }) => activeStatuses.has(job.status));
  const settledJobs = readyJobs + errorJobs;
  const batchComplete = settledJobs === assets.length;
  const automaticCandidateIds = Object.values(candidateScores).filter((score) => score.tier === "high" || score.tier === "medium").sort((a, b) => b.overallScore - a.overallScore).slice(0, MAX_AUTO_AI_CANDIDATES).map((score) => score.segmentId);

  return <main className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
    <nav className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-6 py-7 md:px-12 lg:px-20"><Link className="text-[17px] font-semibold tracking-[-0.04em]" href="/">CutMind<span className="text-[var(--accent)]">.</span></Link><span className="font-mono text-xs text-black/35">PROJECT / {projectId}</span></nav>
    <header className="mx-auto w-full max-w-[1440px] px-6 pb-14 pt-14 md:px-12 lg:px-20 lg:pb-20 lg:pt-24"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Material analysis / Segments</p><div className="mt-5 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-5xl font-medium leading-[0.95] tracking-[-0.06em] md:text-7xl">找到画面真正<br />发生变化的地方。</h1><p className="mt-6 max-w-xl text-base leading-7 text-black/45">本地场景检测只决定在哪里切开，不理解内容，也不判断素材价值。</p></div><div className="grid grid-cols-3 gap-px border border-black/10 bg-black/10"><HeaderStat label="视频" value={`${assets.length}`} /><HeaderStat label="Ready" value={`${readyJobs}`} /><HeaderStat label="Segments" value={`${totalSegments}`} /></div></div></header>
    <section className="border-t border-black/10 bg-[var(--surface)]"><div className="mx-auto w-full max-w-[1440px] px-6 py-10 md:px-12 lg:px-20 lg:py-16">
      <BatchProgress total={assets.length} ready={readyJobs} errors={errorJobs} processing={processingJobs} progress={overallProgress} active={activeJob} complete={batchComplete} segments={totalSegments} />
      {readyJobs === readyAssets && readyJobs > 0 && <CandidateDiscoveryPanel total={totalSegments} scores={candidateScores} state={candidateDiscovery} onStart={() => void discoverCandidates()} />}
      {candidateDiscovery.status === "ready" && <AnalysisProgress candidateIds={automaticCandidateIds} analyses={analysesBySegment} jobs={analysisJobs} configuration={aiConfiguration} onStart={() => void analyzeAllSegments()} />}
      {candidateDiscovery.status === "ready" && <StoryDiscoveryPanel />}
      {selectedStoryCandidateId && <EditingPlanPanel />}
      {selectedStoryCandidateId && <EditingPlanPreview />}
      <div className="mt-12 space-y-12">{jobs.map(({ asset, job }) => <VideoSegments key={asset.id} asset={asset} job={job} segments={segmentsByVideo[asset.id] ?? []} thumbnails={segmentThumbnailUrls} analyses={analysesBySegment} analysisJobs={analysisJobs} candidateScores={candidateScores} selectedId={selected[asset.id]} onSelect={(segment) => setSelected((current) => ({ ...current, [asset.id]: segment.id }))} onPreview={setPreviewSegment} onReanalyze={(segment) => void reanalyzeSegment(segment)} />)}</div>
    </div></section>
    <footer className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-6 py-8 text-xs text-black/35 md:flex-row md:justify-between md:px-12 lg:px-20"><span>Scene threshold {segmentationConfig.sceneThreshold}</span><span>Min {segmentationConfig.minSegmentDuration}s · Max {segmentationConfig.maxSegmentDuration}s</span></footer>
    {previewSegment && runtimeUrls[previewSegment.videoId] && <SegmentPreview segment={previewSegment} sourceUrl={runtimeUrls[previewSegment.videoId].previewUrl} onClose={() => setPreviewSegment(null)} />}
  </main>;
}

function HeaderStat({ label, value }: { label: string; value: string }) { return <div className="min-w-24 bg-[var(--paper)] px-4 py-4"><p className="text-[10px] uppercase tracking-[0.14em] text-black/30">{label}</p><p className="mt-2 text-xl font-medium">{value}</p></div>; }

function BatchProgress({ total, ready, errors, processing, progress, active, complete, segments }: { total: number; ready: number; errors: number; processing: number; progress: number; active?: { asset: VideoAsset; job: SegmentationJob }; complete: boolean; segments: number }) {
  const percent = Math.round(progress * 100);
  const currentPosition = Math.min(total, ready + errors + (processing > 0 ? 1 : 0));
  return <section className="border border-black/10 bg-[var(--paper)] p-6 md:p-8" aria-label="素材处理进度">
    <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">{complete ? "素材切片完成" : "正在分析素材"}</p><h2 className="mt-3 text-3xl font-medium tracking-[-0.045em]">{complete ? `${total} 个视频 · ${segments} 个 Segments` : `${currentPosition} / ${total} 个视频`}</h2>{active ? <div className="mt-4"><p className="text-sm text-black/60">正在处理：<span className="font-medium text-black/85">{active.asset.fileName}</span></p><p className="mt-1 text-sm text-black/40">{jobDetail(active.job)}</p></div> : <p className="mt-4 text-sm text-black/40">{errors > 0 ? `${ready} Ready · ${errors} Error · 整体处理完成` : `${ready} Ready`}</p>}</div><div className="font-mono text-5xl font-medium tracking-[-0.06em] md:text-6xl">{percent}<span className="ml-1 text-xl text-black/30">%</span></div></div>
    <div className="mt-7 h-1.5 overflow-hidden bg-black/10"><div className="h-full bg-[var(--accent)] transition-[width] duration-200" style={{ width: `${percent}%` }} /></div>
    <div className="mt-3 flex justify-between text-[11px] uppercase tracking-[0.12em] text-black/30"><span>{ready} Ready{errors > 0 ? ` · ${errors} Error` : ""}</span><span>{complete ? "Complete" : `${total - ready - errors} remaining`}</span></div>
  </section>;
}

function jobDetail(job: SegmentationJob) {
  const completed = job.completedUnits ?? 0;
  const total = job.totalUnits ?? 0;
  if (job.status === "reading") return "正在读取视频信息";
  if (job.status === "sampling_frames") return `正在准备帧采样 · ${completed} / ${total} frames`;
  if (job.status === "detecting_scenes") return `正在检测画面变化 · ${completed} / ${total} frames · ${total > 0 ? Math.round((completed / total) * 100) : 0}%`;
  if (job.status === "creating_segments") return "正在清理边界并创建 Segments";
  if (job.status === "generating_thumbnails") return `正在生成片段缩略图 · ${completed} / ${total}`;
  if (job.status === "ready") return "Ready";
  if (job.status === "error") return job.error ?? "处理失败";
  return "Waiting";
}

function VideoSegments({ asset, job, segments, thumbnails, analyses, analysisJobs, candidateScores, selectedId, onSelect, onPreview, onReanalyze }: { asset: VideoAsset; job: SegmentationJob; segments: VideoSegment[]; thumbnails: Record<string, string>; analyses: Record<string, SegmentAnalysisResult>; analysisJobs: Record<string, SegmentAnalysisJob>; candidateScores: Record<string, SegmentCandidateScore>; selectedId?: string; onSelect: (segment: VideoSegment) => void; onPreview: (segment: VideoSegment) => void; onReanalyze: (segment: VideoSegment) => void }) {
  const statusLabel = job.status === "ready" ? `Ready · ${segments.length} segments` : job.status === "error" ? "Error" : jobDetail(job);
  return <article className="border-t border-black/15 pt-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h2 className="max-w-2xl truncate text-2xl font-medium tracking-[-0.035em]">{asset.fileName}</h2><p className="mt-2 text-sm text-black/40">{asset.duration?.toFixed(2) ?? "—"}s · {statusLabel}</p>{job.error && <p className="mt-2 text-sm text-[var(--accent)]">{job.error}</p>}{activeStatuses.has(job.status) && <div className="mt-4 h-1 w-full max-w-md bg-black/10"><div className="h-full bg-black/60 transition-[width] duration-200" style={{ width: `${Math.round(job.progress * 100)}%` }} /></div>}</div>{process.env.NODE_ENV === "development" && job.debug && <p className="font-mono text-[10px] leading-5 text-black/30">duration: {job.debug.duration.toFixed(2)} · raw boundaries: {job.debug.rawBoundaries}<br />sampled: {job.debug.sampledFrames} · final: {job.debug.finalSegments} · threshold: {job.debug.threshold}</p>}</div>
    {asset.duration && segments.length > 0 && <div className="mt-7"><div className="flex h-12 gap-0.5 bg-black/5 p-0.5">{segments.map((segment, index) => <button aria-label={`选择 Segment ${index + 1}`} className={`min-w-[3px] transition-colors ${selectedId === segment.id ? "bg-[var(--accent)]" : "bg-black/25 hover:bg-black/45"}`} key={segment.id} onClick={() => onSelect(segment)} style={{ width: `${(segment.duration / asset.duration!) * 100}%` }} title={`${segment.startTime.toFixed(2)}s – ${segment.endTime.toFixed(2)}s`} type="button" />)}</div><div className="mt-2 flex justify-between font-mono text-[10px] text-black/30"><span>0s</span><span>{asset.duration.toFixed(2)}s</span></div></div>}
    {segments.length > 0 && <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{segments.map((segment, index) => <SegmentCard key={segment.id} segment={segment} index={index} thumbnailUrl={thumbnails[segment.id]} analysis={analyses[segment.id]} analysisJob={analysisJobs[segment.id]} candidateScore={candidateScores[segment.id]} selected={selectedId === segment.id} onSelect={() => onSelect(segment)} onPreview={() => onPreview(segment)} onReanalyze={() => onReanalyze(segment)} />)}</div>}
  </article>;
}

function SegmentCard({ segment, index, thumbnailUrl, analysis, analysisJob, candidateScore, selected, onSelect, onPreview, onReanalyze }: { segment: VideoSegment; index: number; thumbnailUrl?: string; analysis?: SegmentAnalysisResult; analysisJob?: SegmentAnalysisJob; candidateScore?: SegmentCandidateScore; selected: boolean; onSelect: () => void; onPreview: () => void; onReanalyze: () => void }) {
  const [details, setDetails] = useState(false);
  const busy = analysisJob && !["idle", "ready", "error"].includes(analysisJob.status);
  return <div className={`border bg-[var(--paper)] p-3 transition-colors ${selected ? "border-[var(--accent)]" : "border-black/10"}`} onClick={onSelect}>
    <div className="relative aspect-video bg-black/10" style={thumbnailUrl ? { backgroundImage: `url(${thumbnailUrl})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}>{!thumbnailUrl && <span className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-[0.12em] text-black/25">Frame unavailable</span>}<span className="absolute left-2 top-2 bg-black/75 px-2 py-1 font-mono text-[10px] text-white">SEG {String(index + 1).padStart(2, "0")}</span></div>
    <div className="px-1 pb-1 pt-4"><p className="font-mono text-sm">{preciseTime(segment.startTime)} → {preciseTime(segment.endTime)}</p><div className="mt-2 flex items-center justify-between text-xs text-black/40"><span>{segment.duration.toFixed(2)}s</span><span>{reasonLabels[segment.segmentationReason]}</span></div>
      {analysisJob && analysisJob.status !== "ready" && <><p className={`mt-4 text-xs ${analysisJob.status === "error" ? "text-[var(--accent)]" : "text-black/45"}`}>{analysisJobLabel(analysisJob)}</p>{process.env.NODE_ENV === "development" && analysisJob.technicalMessage && <p className="mt-1 font-mono text-[10px] text-black/30">{analysisJob.errorCode}: {analysisJob.technicalMessage}</p>}</>}
      {analysisJob?.status === "error" && <button className="mt-3 text-xs underline decoration-black/20 underline-offset-4" onClick={(event) => { event.stopPropagation(); onReanalyze(); }} type="button">重新理解这个片段</button>}
      {candidateScore && <div className="mt-5 border-t border-black/10 pt-4"><div className="flex items-end justify-between"><div><p className="text-[10px] uppercase tracking-[0.14em] text-black/30">本地优先级</p><p className="mt-1 text-sm font-medium">{candidateTierLabels[candidateScore.tier]}</p></div><p className="font-mono text-xl">{candidateScore.overallScore}<span className="text-xs text-black/30"> / 100</span></p></div><div className="mt-3 space-y-1">{candidateScore.reasons.slice(0, 4).map((reason) => <p className="text-xs text-black/50" key={reason}>✓ {reason}</p>)}</div>{process.env.NODE_ENV === "development" && <details className="mt-3 text-[10px] text-black/30"><summary>Local metrics</summary><p className="mt-1 font-mono">motion {candidateScore.motionScore ?? "—"} · change {candidateScore.visualChangeScore ?? "—"} · sharp {candidateScore.sharpnessScore ?? "—"} · light {candidateScore.brightnessScore ?? "—"} · duplicate −{candidateScore.duplicatePenalty} · static −{candidateScore.staticPenalty}</p></details>}</div>}
      {candidateScore && !analysis && analysisJob?.status !== "error" && !busy && <button className="mt-4 text-xs underline decoration-black/20 underline-offset-4" onClick={(event) => { event.stopPropagation(); onReanalyze(); }} type="button">让 AI 理解这个片段</button>}
      {analysis && <div className="mt-5 border-t border-black/10 pt-4">
        <p className="text-[10px] uppercase tracking-[0.14em] text-black/30">片段概述</p><p className="mt-2 text-sm font-medium leading-6">{analysis.momentSummary}</p>
        <p className="mt-5 text-[10px] uppercase tracking-[0.14em] text-black/30">AI 理解</p><p className="mt-2 text-xs leading-5 text-black/55">{analysis.visualDescription}</p>
        <p className="mt-5 text-[10px] uppercase tracking-[0.14em] text-black/30">适合怎么用</p><div className="mt-2 flex flex-wrap gap-1">{analysis.possibleRoles.map((role) => <span className="bg-black/5 px-2 py-1 text-[11px]" key={role}>{analysisRoleLabels[role]}</span>)}</div>
        <div className="mt-5 grid grid-cols-2 gap-px bg-black/10"><Score label="大众观看价值" value={analysis.audienceAppeal} /><Score label="画面质量" value={analysis.visualQuality} /></div>
        {details && <div className="mt-5 space-y-2 border-t border-black/10 pt-4 text-xs leading-5 text-black/55"><p>场景：{analysis.scene}</p><p>主体：{analysis.subjects.join(" · ") || "—"}</p><p>动作：{analysis.actions.join(" · ") || "—"}</p><p>镜头方式：{cameraBehaviorLabels[analysis.cameraBehavior]}</p><p>信息价值 {analysis.informationValue} / 100 · 情绪价值 {analysis.emotionalValue} / 100 · 新鲜度 {analysis.novelty} / 100</p><p className="font-mono text-[10px]">Analyzed with {modelLabel(analysis.model)} · {analysis.provider}</p></div>}
        <div className="mt-4 flex gap-4"><button className="text-xs underline decoration-black/20 underline-offset-4" onClick={(event) => { event.stopPropagation(); setDetails((value) => !value); }} type="button">{details ? "收起详细分析" : "查看详细分析"}</button><button className="text-xs underline decoration-black/20 underline-offset-4 disabled:opacity-30" disabled={Boolean(busy)} onClick={(event) => { event.stopPropagation(); onReanalyze(); }} type="button">重新理解</button></div>
      </div>}
      <button className="mt-5 text-xs font-medium underline decoration-black/20 underline-offset-4 hover:decoration-black" onClick={(event) => { event.stopPropagation(); onPreview(); }} type="button">Preview Segment →</button>
    </div>
  </div>;
}

function Score({ label, value }: { label: string; value: number }) {
  return <div className="bg-[var(--paper)] p-3"><p className="text-[10px] text-black/35">{label}</p><p className="mt-1 font-mono text-lg">{value}<span className="text-xs text-black/30"> / 100</span></p></div>;
}

function analysisJobLabel(job: SegmentAnalysisJob) {
  if (job.status === "preparing_keyframes") return `正在提取真实关键帧 · ${job.completedUnits ?? 0} / ${job.totalUnits ?? 0}`;
  if (job.status === "sending_to_ai") return `正在使用 ${modelLabel(job.model)} 理解画面 · Attempt ${job.attempt ?? 1} / ${job.maxAttempts ?? 3}`;
  if (job.status === "retrying") return `${modelLabel(job.model)} 暂时繁忙 · 正在重试 ${job.attempt ?? "—"} / ${job.maxAttempts ?? 3}…`;
  if (job.status === "switching_model") return `主模型暂时繁忙，正在切换备用模型 ${modelLabel(job.model)}…`;
  if (job.status === "validating_result") return "正在校验结构化结果";
  if (job.status === "error") return job.error ?? "理解失败";
  return "等待理解";
}

function modelLabel(model?: string) {
  if (!model) return "AI";
  if (model.startsWith("qwen")) return `Qwen · ${model}`;
  return model.replace(/^gemini-/, "Gemini ").replace(/-flash$/, " Flash");
}

function CandidateDiscoveryPanel({ total, scores, state, onStart }: { total: number; scores: Record<string, SegmentCandidateScore>; state: CandidateDiscoveryState; onStart: () => void }) {
  const counts = { high: 0, medium: 0, low: 0, archive: 0 };
  Object.values(scores).forEach((score) => { counts[score.tier] += 1; });
  const percent = state.total ? Math.round((state.completed / state.total) * 100) : 0;
  return <section className="mt-8 border border-black/10 bg-[var(--paper)] p-6 md:p-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">快速筛选素材 · 100% Local</p><div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-medium">{state.status === "scanning" ? `正在快速扫描素材 · ${state.completed} / ${state.total}` : state.status === "ready" ? "本地候选筛选完成" : "先找出值得深度理解的片段"}</h2><p className="mt-2 text-sm text-black/40">画面变化 · 运动 · 清晰度 · 曝光 · 附近重复镜头</p></div>{state.status !== "scanning" && <button className="bg-[var(--ink)] px-5 py-3 text-sm text-white" onClick={onStart} type="button">{state.status === "ready" ? "重新快速筛选" : `快速筛选 ${total} 个片段`}</button>}</div>{state.status === "scanning" && <><div className="mt-6 h-1 bg-black/10"><div className="h-full bg-[var(--accent)]" style={{ width: `${percent}%` }} /></div><p className="mt-3 text-xs text-black/40">真实完成 {state.completed} / {state.total}{state.errorCount ? ` · ${state.errorCount} 个无法评分` : ""}</p></>}{state.status === "ready" && <><div className="mt-6 grid grid-cols-2 gap-px bg-black/10 md:grid-cols-4">{(["high", "medium", "low", "archive"] as const).map((tier) => <div className="bg-[var(--paper)] p-3" key={tier}><p className="text-[10px] text-black/35">{candidateTierLabels[tier]}</p><p className="mt-1 font-mono text-xl">{counts[tier]}</p></div>)}</div><p className="mt-3 text-xs text-black/35">Candidate Score 只决定是否优先让 AI 查看，不等同于大众观看价值。{state.durationMs !== undefined ? ` 本地用时 ${(state.durationMs / 1000).toFixed(2)}s · 平均 ${state.averageMsPerSegment?.toFixed(1)}ms / Segment` : ""}</p></>}</section>;
}

function AnalysisProgress({ candidateIds, analyses, jobs, configuration, onStart }: { candidateIds: string[]; analyses: Record<string, SegmentAnalysisResult>; jobs: Record<string, SegmentAnalysisJob>; configuration: { status: string; model?: string; provider?: string }; onStart: () => void }) {
  const eligible = new Set(candidateIds); const total = candidateIds.length;
  const ready = candidateIds.filter((id) => Boolean(analyses[id])).length;
  const errors = candidateIds.filter((id) => jobs[id]?.status === "error").length;
  const activeJobs = Object.entries(jobs).filter(([id, job]) => eligible.has(id) && !["idle", "ready", "error"].includes(job.status));
  const active = activeJobs[0];
  const settled = Math.min(total, ready + errors);
  const progressFor = (job: SegmentAnalysisJob) => {
    if (job.status === "ready" || job.status === "error") return 1;
    const frames = job.totalUnits ?? 3;
    if (job.status === "preparing_keyframes") return (job.completedUnits ?? 0) / (frames + 2);
    if (job.status === "sending_to_ai") return frames / (frames + 2);
    if (job.status === "retrying") return frames / (frames + 2);
    if (job.status === "switching_model") return frames / (frames + 2);
    if (job.status === "validating_result") return (frames + 1) / (frames + 2);
    return 0;
  };
  const percent = total ? Math.round((candidateIds.reduce((sum, id) => sum + (jobs[id] ? progressFor(jobs[id]) : 0), 0) / total) * 100) : 0;
  return <section className="mt-8 border border-black/10 bg-[var(--paper)] p-6 md:p-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">AI 深度理解候选片段</p>{configuration.status === "checking" && <p className="mt-4 text-sm text-black/45">正在检查视觉理解配置…</p>}{configuration.status === "missing" && <><h2 className="mt-3 text-2xl font-medium">AI understanding is not configured.</h2><p className="mt-3 text-sm text-black/45">请在 <code>.env.local</code> 中配置 <code>GEMINI_API_KEY</code>。现有本地筛选、切片和预览不受影响。</p></>}{configuration.status === "error" && <p className="mt-4 text-sm text-[var(--accent)]">暂时无法检查视觉理解配置，请刷新后重试。</p>}{configuration.status === "configured" && <>{total === 0 ? <p className="mt-4 text-sm text-black/45">本批次没有 high / medium 自动候选；你仍可以在任意片段卡片上手动启动 AI 理解。</p> : <><div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-medium">{ready === total ? "候选片段理解完成" : active ? `正在理解 ${Math.min(total, settled + activeJobs.length)} / ${total}` : `${total} 个候选片段等待深度理解`}</h2><p className="mt-2 text-sm text-black/40">仅自动处理优先看看与可能值得用 · {configuration.model}{activeJobs.length > 0 ? ` · 同时处理 ${activeJobs.length} 个片段` : ""}</p></div>{!active && ready < total && <button className="bg-[var(--ink)] px-5 py-3 text-sm text-white" onClick={onStart} type="button">{ready > 0 ? "继续理解候选片段" : "AI 深度理解候选片段"}</button>}</div>{(active || ready > 0 || errors > 0) && <><div className="mt-6 h-1 bg-black/10"><div className="h-full bg-[var(--accent)]" style={{ width: `${percent}%` }} /></div><p className="mt-3 text-xs text-black/40">{ready} Ready{errors ? ` · ${errors} Error` : ""}{active ? ` · ${analysisJobLabel(active[1])}` : ""}</p></>}</>}</>}</section>;
}

function SegmentPreview({ segment, sourceUrl, onClose }: { segment: VideoSegment; sourceUrl: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const resetToStart = () => { const video = videoRef.current; if (video) video.currentTime = segment.startTime; };
  return <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 md:p-10" role="dialog" onClick={onClose}><div className="w-full max-w-5xl" onClick={(event) => event.stopPropagation()}><div className="mb-3 flex items-center justify-between text-white"><span className="font-mono text-xs">{preciseTime(segment.startTime)} → {preciseTime(segment.endTime)}</span><button className="px-3 py-2 text-sm text-white/70 hover:text-white" onClick={onClose} type="button">关闭 ×</button></div><video ref={videoRef} className="max-h-[78vh] w-full bg-black" controls playsInline src={sourceUrl} onLoadedMetadata={resetToStart} onPlay={() => { const video = videoRef.current; if (video && video.currentTime >= segment.endTime - 0.08) video.currentTime = segment.startTime; }} onTimeUpdate={() => { const video = videoRef.current; if (video && video.currentTime >= segment.endTime) { video.pause(); video.currentTime = segment.startTime; } }} /></div></div>;
}
