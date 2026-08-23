"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { EditingPlan, SegmentAnalysisResult, SegmentCandidateScore, StoryCandidate, VideoAsset, VideoSegment } from "@/domain/types";
import { extractSegmentKeyframes } from "@/features/analysis/keyframe-extraction";
import { runAnalysisQueue } from "@/features/analysis/sequential-analysis-queue";
import { SEGMENT_ANALYSIS_CONCURRENCY } from "@/features/analysis/config";
import { MAX_ANALYZE_SEGMENT_REQUEST_BYTES, MAX_LOCAL_VIDEO_PROCESSING_CONCURRENCY } from "@/features/processing/config";
import { measureSegmentLocally, type LocalCandidateMeasurement } from "@/features/candidate-discovery/browser-candidate-scoring";
import { duplicatePenaltyForSimilarity, fingerprintSimilarity, scoreCandidate, selectAutomaticCandidates } from "@/features/candidate-discovery/candidate-scoring";
import { LOCAL_SCORING_CONCURRENCY } from "@/features/candidate-discovery/config";
import { buildStoryDiscoveryInput } from "@/features/story-discovery/story-discovery-input";
import { MIN_STORY_DISCOVERY_ANALYZED_SEGMENTS } from "@/features/story-discovery/config";
import { buildEditingPlanInput } from "@/features/editing-plan/editing-plan-input";
import { generateLocalEditingPlan } from "@/features/editing-plan/local-editing-plan";
import { recalculateTimeline } from "@/server/editing/editing-plan-schema";
import { createVideoThumbnail, createVideoThumbnailAt, fileFingerprint, isAcceptedVideo, MAX_VIDEO_FILES, readVideoMetadata, type LocalVideoRuntime } from "@/features/materials/local-video";
import { detectSceneBoundaries } from "@/features/segmentation/browser-scene-detector";
import { createSegmentIntervals } from "@/features/segmentation/segment-boundaries";
import { FRAME_SAMPLE_INTERVAL, MAX_SEGMENT_DURATION, MIN_SEGMENT_DURATION, SCENE_THRESHOLD } from "@/features/segmentation/config";

export type SegmentationStatus =
  | "waiting"
  | "reading"
  | "sampling_frames"
  | "detecting_scenes"
  | "creating_segments"
  | "generating_thumbnails"
  | "ready"
  | "error";

export interface SegmentationJob {
  status: SegmentationStatus;
  progress: number;
  completedUnits?: number;
  totalUnits?: number;
  error?: string;
  debug?: { duration: number; rawBoundaries: number; sampledFrames: number; finalSegments: number; threshold: number };
}

export type AnalysisStatus = "idle" | "preparing_keyframes" | "sending_to_ai" | "retrying" | "switching_model" | "validating_result" | "ready" | "error";
export interface SegmentAnalysisJob {
  status: AnalysisStatus;
  completedUnits?: number;
  totalUnits?: number;
  error?: string;
  errorCode?: string;
  technicalMessage?: string;
  attempt?: number;
  maxAttempts?: number;
  model?: string;
  previousModel?: string;
}
export type AiConfiguration = { status: "checking" | "configured" | "missing" | "error"; model?: string; provider?: "qwen" | "gemini" };
export interface CandidateDiscoveryState { status: "idle" | "scanning" | "ready" | "error"; completed: number; total: number; currentSegmentId?: string; durationMs?: number; averageMsPerSegment?: number; errorCount?: number }
export interface StoryDiscoveryState { status: "idle" | "preparing" | "waiting" | "cooldown" | "discovering" | "retrying" | "switching_model" | "ready" | "error"; error?: string; errorCode?: string; failureStage?: string; technicalMessage?: string; model?: string; attempt?: number; maxAttempts?: number; inputSegmentCount?: number; payloadBytes?: number; highCount?: number; mediumCount?: number; activeRequests?: number; queuedRequests?: number; cooldownUntil?: number; candidateSegmentCount?: number }
export interface EditingPlanState { status: "idle" | "preparing" | "generating" | "retrying" | "ready" | "error"; error?: string; model?: string; attempt?: number; maxAttempts?: number }

interface ProjectSessionValue {
  assets: VideoAsset[];
  runtimeUrls: Record<string, { previewUrl: string; thumbnailUrl: string | null }>;
  notice: string | null;
  addFiles: (files: File[]) => void;
  removeAsset: (asset: VideoAsset) => void;
  segmentsByVideo: Record<string, VideoSegment[]>;
  segmentThumbnailUrls: Record<string, string>;
  segmentationJobs: Record<string, SegmentationJob>;
  segmentAll: () => Promise<void>;
  analysesBySegment: Record<string, SegmentAnalysisResult>;
  analysisJobs: Record<string, SegmentAnalysisJob>;
  aiConfiguration: AiConfiguration;
  analyzeAllSegments: () => Promise<void>;
  reanalyzeSegment: (segment: VideoSegment) => Promise<void>;
  candidateScores: Record<string, SegmentCandidateScore>;
  candidateDiscovery: CandidateDiscoveryState;
  discoverCandidates: () => Promise<void>;
  storyCandidates: StoryCandidate[];
  storyDiscovery: StoryDiscoveryState;
  discoverStories: (regenerate?: boolean) => Promise<void>;
  cancelStoryDiscovery: () => void;
  selectedStoryCandidateId: string | null;
  selectStoryCandidate: (id: string) => void;
  editingPlan: EditingPlan | null;
  editingPlanState: EditingPlanState;
  generateEditingPlan: (regenerate?: boolean) => Promise<void>;
  removeEditingPlanItem: (id: string) => void;
  moveEditingPlanItem: (id: string, direction: -1 | 1) => void;
}

const ProjectSessionContext = createContext<ProjectSessionValue | null>(null);

const revokeRuntime = (runtime: LocalVideoRuntime | undefined) => {
  if (!runtime) return;
  URL.revokeObjectURL(runtime.previewUrl);
  if (runtime.thumbnailUrl) URL.revokeObjectURL(runtime.thumbnailUrl);
};

export function ProjectSessionProvider({ children }: { children: ReactNode }) {
  const [assets, setAssets] = useState<VideoAsset[]>([]);
  const [runtimeUrls, setRuntimeUrls] = useState<Record<string, { previewUrl: string; thumbnailUrl: string | null }>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [segmentsByVideo, setSegmentsByVideo] = useState<Record<string, VideoSegment[]>>({});
  const [segmentThumbnailUrls, setSegmentThumbnailUrls] = useState<Record<string, string>>({});
  const [segmentationJobs, setSegmentationJobs] = useState<Record<string, SegmentationJob>>({});
  const [analysesBySegment, setAnalysesBySegment] = useState<Record<string, SegmentAnalysisResult>>({});
  const [analysisJobs, setAnalysisJobs] = useState<Record<string, SegmentAnalysisJob>>({});
  const [aiConfiguration, setAiConfiguration] = useState<AiConfiguration>({ status: "checking" });
  const [candidateScores, setCandidateScores] = useState<Record<string, SegmentCandidateScore>>({});
  const [candidateDiscovery, setCandidateDiscovery] = useState<CandidateDiscoveryState>({ status: "idle", completed: 0, total: 0 });
  const [storyCandidates, setStoryCandidates] = useState<StoryCandidate[]>([]);
  const [storyDiscovery, setStoryDiscovery] = useState<StoryDiscoveryState>({ status: "idle" });
  const [selectedStoryCandidateId, setSelectedStoryCandidateId] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<EditingPlan | null>(null);
  const [editingPlanState, setEditingPlanState] = useState<EditingPlanState>({ status: "idle" });
  const runtimes = useRef(new Map<string, LocalVideoRuntime>());
  const fingerprints = useRef(new Set<string>());
  const inFlight = useRef(new Set<string>());
  const completed = useRef(new Set<string>());
  const batchInFlight = useRef(false);
  const segmentThumbnails = useRef(new Map<string, string>());
  const analysisInFlight = useRef(new Set<string>());
  const analysisBatchInFlight = useRef(false);
  const analysesRef = useRef<Record<string, SegmentAnalysisResult>>({});
  const candidateBatchInFlight = useRef(false);
  const storyDiscoveryInFlight = useRef(false);
  const storyCandidatesRef = useRef<StoryCandidate[]>([]);
  const editingPlanInFlight = useRef(false);
  const storyDiscoveryAbort = useRef<AbortController | null>(null);

  useEffect(() => { analysesRef.current = analysesBySegment; }, [analysesBySegment]);
  useEffect(() => { storyCandidatesRef.current = storyCandidates; }, [storyCandidates]);
  useEffect(() => {
    let active = true;
    void fetch("/api/analyze-segment").then(async (response) => {
      if (!response.ok) throw new Error("configuration check failed");
      const data = await response.json() as { configured: boolean; model?: string; provider?: "qwen" | "gemini" };
      if (active) setAiConfiguration({ status: data.configured ? "configured" : "missing", model: data.model, provider: data.provider });
    }).catch(() => { if (active) setAiConfiguration({ status: "error" }); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const runtimeMap = runtimes.current;
    const fingerprintSet = fingerprints.current;
    const thumbnails = segmentThumbnails.current;
    return () => {
      runtimeMap.forEach(revokeRuntime);
      thumbnails.forEach((url) => URL.revokeObjectURL(url));
      runtimeMap.clear();
      thumbnails.clear();
      fingerprintSet.clear();
    };
  }, []);

  const processAsset = useCallback(async (id: string) => {
    const runtime = runtimes.current.get(id);
    if (!runtime) return;
    setAssets((current) => current.map((asset) => asset.id === id ? { ...asset, status: "reading_metadata" } : asset));
    try {
      const metadata = await readVideoMetadata(runtime.previewUrl);
      let thumbnailUrl: string | null = null;
      try { thumbnailUrl = await createVideoThumbnail(runtime.previewUrl, metadata.duration); } catch { /* Playback remains the fallback. */ }
      const activeRuntime = runtimes.current.get(id);
      if (!activeRuntime) { if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl); return; }
      activeRuntime.thumbnailUrl = thumbnailUrl;
      setRuntimeUrls((current) => ({ ...current, [id]: { ...current[id], thumbnailUrl } }));
      setAssets((current) => current.map((asset) => asset.id === id ? { ...asset, ...metadata, status: "ready", error: undefined } : asset));
      setSegmentationJobs((current) => ({ ...current, [id]: { status: "waiting", progress: 0 } }));
    } catch (error) {
      if (!runtimes.current.has(id)) return;
      const message = error instanceof Error ? error.message : "无法读取视频信息";
      setAssets((current) => current.map((asset) => asset.id === id ? { ...asset, status: "error", error: message } : asset));
      setSegmentationJobs((current) => ({ ...current, [id]: { status: "error", progress: 1, error: message } }));
    }
  }, []);

  const addFiles = useCallback((incoming: File[]) => {
    setNotice(null);
    const availableSlots = MAX_VIDEO_FILES - runtimes.current.size;
    if (availableSlots <= 0) { setNotice(`每个批次最多 ${MAX_VIDEO_FILES} 个视频，请先移除部分素材。`); return; }
    const rejected: string[] = [];
    const duplicates: string[] = [];
    const accepted: File[] = [];
    const batchFingerprints = new Set<string>();
    for (const file of incoming) {
      if (!isAcceptedVideo(file)) { rejected.push(file.name); continue; }
      const fingerprint = fileFingerprint(file);
      if (fingerprints.current.has(fingerprint) || batchFingerprints.has(fingerprint)) { duplicates.push(file.name); continue; }
      if (accepted.length >= availableSlots) continue;
      batchFingerprints.add(fingerprint);
      accepted.push(file);
    }
    if (rejected.length || duplicates.length || incoming.length > availableSlots) {
      const parts: string[] = [];
      if (rejected.length) parts.push(`${rejected.length} 个非支持格式已忽略`);
      if (duplicates.length) parts.push(`${duplicates.length} 个重复文件已忽略`);
      if (incoming.length - rejected.length - duplicates.length > availableSlots) parts.push(`已达到 ${MAX_VIDEO_FILES} 个上限`);
      setNotice(parts.join("；"));
    }
    const createdAssets = accepted.map((file) => {
      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      fingerprints.current.add(fileFingerprint(file));
      runtimes.current.set(id, { file, previewUrl, thumbnailUrl: null });
      setRuntimeUrls((current) => ({ ...current, [id]: { previewUrl, thumbnailUrl: null } }));
      return { id, fileName: file.name, fileType: file.type, fileSize: file.size, duration: null, width: null, height: null, thumbnailUrl: null, status: "selected" as const, createdAt: new Date().toISOString() } satisfies VideoAsset;
    });
    setAssets((current) => [...current, ...createdAssets]);
    void runAnalysisQueue(createdAssets, () => false, async (asset) => processAsset(asset.id), MAX_LOCAL_VIDEO_PROCESSING_CONCURRENCY);
  }, [processAsset]);

  const removeAsset = useCallback((asset: VideoAsset) => {
    const runtime = runtimes.current.get(asset.id);
    fingerprints.current.delete(runtime ? fileFingerprint(runtime.file) : "");
    revokeRuntime(runtime);
    runtimes.current.delete(asset.id);
    const oldSegments = segmentsByVideo[asset.id] ?? [];
    oldSegments.forEach((segment) => {
      const url = segmentThumbnails.current.get(segment.id);
      if (url) URL.revokeObjectURL(url);
      segmentThumbnails.current.delete(segment.id);
    });
    completed.current.delete(asset.id);
    setRuntimeUrls((current) => { const next = { ...current }; delete next[asset.id]; return next; });
    setAssets((current) => current.filter((item) => item.id !== asset.id));
    setSegmentsByVideo((current) => { const next = { ...current }; delete next[asset.id]; return next; });
    setSegmentationJobs((current) => { const next = { ...current }; delete next[asset.id]; return next; });
    setSegmentThumbnailUrls((current) => {
      const next = { ...current };
      oldSegments.forEach((segment) => delete next[segment.id]);
      return next;
    });
    setAnalysesBySegment((current) => { const next = { ...current }; oldSegments.forEach((segment) => delete next[segment.id]); return next; });
    setAnalysisJobs((current) => { const next = { ...current }; oldSegments.forEach((segment) => delete next[segment.id]); return next; });
    setCandidateScores((current) => { const next = { ...current }; oldSegments.forEach((segment) => delete next[segment.id]); return next; });
  }, [segmentsByVideo]);

  const segmentVideo = useCallback(async (asset: VideoAsset) => {
    if (inFlight.current.has(asset.id) || completed.current.has(asset.id) || asset.duration === null) return;
    const runtime = runtimes.current.get(asset.id);
    if (!runtime) return;
    const duration = asset.duration;
    inFlight.current.add(asset.id);
    setSegmentationJobs((current) => ({ ...current, [asset.id]: { status: "sampling_frames", progress: 0, completedUnits: 0, totalUnits: Math.ceil(duration / FRAME_SAMPLE_INTERVAL) } }));
    try {
      const detection = await detectSceneBoundaries(runtime.previewUrl, duration, SCENE_THRESHOLD, FRAME_SAMPLE_INTERVAL, ({ processedFrames, totalFrames }) => {
        setSegmentationJobs((current) => ({ ...current, [asset.id]: {
          status: processedFrames === 0 ? "sampling_frames" : "detecting_scenes",
          progress: totalFrames > 0 ? (processedFrames / totalFrames) / 3 : 0,
          completedUnits: processedFrames,
          totalUnits: totalFrames,
        } }));
      });
      setSegmentationJobs((current) => ({ ...current, [asset.id]: { status: "creating_segments", progress: 1 / 3, completedUnits: 0, totalUnits: 1 } }));
      const intervals = createSegmentIntervals(duration, detection.boundaries);
      const segments: VideoSegment[] = intervals.map((interval) => ({
        id: crypto.randomUUID(), videoId: asset.id, ...interval, status: "ready",
        transcript: null, visualDescription: null, scene: null, subjects: [], actions: [],
        visualQuality: null, informationValue: null, emotionalValue: null, novelty: null,
        audienceAppeal: null, possibleRoles: [],
      }));
      setSegmentationJobs((current) => ({ ...current, [asset.id]: { status: "generating_thumbnails", progress: 2 / 3, completedUnits: 0, totalUnits: segments.length } }));
      const thumbnailSnapshot: Record<string, string> = {};
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        try {
          const url = await createVideoThumbnailAt(runtime.previewUrl, (segment.startTime + segment.endTime) / 2);
          if (!runtimes.current.has(asset.id)) { URL.revokeObjectURL(url); return; }
          segmentThumbnails.current.set(segment.id, url);
          thumbnailSnapshot[segment.id] = url;
        } catch { /* The segment keeps a neutral thumbnail fallback. */ }
        const completedThumbnails = index + 1;
        setSegmentationJobs((current) => ({ ...current, [asset.id]: {
          status: "generating_thumbnails",
          progress: 2 / 3 + (completedThumbnails / Math.max(1, segments.length)) / 3,
          completedUnits: completedThumbnails,
          totalUnits: segments.length,
        } }));
      }
      setSegmentsByVideo((current) => ({ ...current, [asset.id]: segments }));
      setSegmentThumbnailUrls((current) => ({ ...current, ...thumbnailSnapshot }));
      setSegmentationJobs((current) => ({ ...current, [asset.id]: { status: "ready", progress: 1, completedUnits: segments.length, totalUnits: segments.length, debug: { duration, rawBoundaries: detection.boundaries.length, sampledFrames: detection.sampledFrames, finalSegments: segments.length, threshold: detection.threshold } } }));
      completed.current.add(asset.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "本地场景检测失败";
      setSegmentationJobs((current) => ({ ...current, [asset.id]: { status: "error", progress: 1, error: message } }));
    } finally {
      inFlight.current.delete(asset.id);
    }
  }, []);

  const segmentAll = useCallback(async () => {
    if (batchInFlight.current) return;
    batchInFlight.current = true;
    try {
      for (const asset of assets.filter((item) => item.status === "ready")) await segmentVideo(asset);
    } finally {
      batchInFlight.current = false;
    }
  }, [assets, segmentVideo]);

  const discoverCandidates = useCallback(async () => {
    if (candidateBatchInFlight.current) return;
    const segments = assets.flatMap((asset) => segmentsByVideo[asset.id] ?? []);
    if (!segments.length) return;
    candidateBatchInFlight.current = true;
    const startedAt = performance.now(); let completedCount = 0; let errorCount = 0;
    const measurements: Record<string, LocalCandidateMeasurement> = {};
    setCandidateDiscovery({ status: "scanning", completed: 0, total: segments.length });
    try {
      await runAnalysisQueue(segments, () => false, async (segment) => {
        setCandidateDiscovery((current) => ({ ...current, currentSegmentId: segment.id }));
        const sourceUrl = runtimes.current.get(segment.videoId)?.previewUrl;
        try { if (!sourceUrl) throw new Error("本地视频引用不存在"); measurements[segment.id] = await measureSegmentLocally(sourceUrl, segment); }
        catch { errorCount += 1; }
        finally { completedCount += 1; setCandidateDiscovery((current) => ({ ...current, completed: completedCount, errorCount })); }
      }, LOCAL_SCORING_CONCURRENCY);
      const scores: Record<string, SegmentCandidateScore> = {}; const recent: Uint8Array[] = [];
      for (const segment of segments) {
        const measurement = measurements[segment.id]; if (!measurement) continue;
        const similarity = recent.reduce((highest, fingerprint) => Math.max(highest, fingerprintSimilarity(measurement.fingerprint, fingerprint)), 0);
        scores[segment.id] = scoreCandidate(segment.id, measurement.metrics, duplicatePenaltyForSimilarity(similarity));
        recent.push(measurement.fingerprint); if (recent.length > 8) recent.shift();
      }
      setCandidateScores(scores);
      const durationMs = performance.now() - startedAt;
      setCandidateDiscovery({ status: "ready", completed: completedCount, total: segments.length, durationMs, averageMsPerSegment: durationMs / Math.max(1, segments.length), errorCount });
      if (process.env.NODE_ENV === "development") console.info("Local candidate discovery complete", { candidateScoringDurationMs: Math.round(durationMs), segmentCount: segments.length, averageMsPerSegment: Math.round(durationMs / Math.max(1, segments.length)) });
    } catch { setCandidateDiscovery((current) => ({ ...current, status: "error" })); }
    finally { candidateBatchInFlight.current = false; }
  }, [assets, segmentsByVideo]);

  const analyzeOne = useCallback(async (segment: VideoSegment, force = false) => {
    if (aiConfiguration.status !== "configured" || analysisInFlight.current.has(segment.id) || (!force && analysesRef.current[segment.id])) return;
    const runtime = runtimes.current.get(segment.videoId);
    if (!runtime) return;
    analysisInFlight.current.add(segment.id);
    try {
      setAnalysisJobs((current) => ({ ...current, [segment.id]: { status: "preparing_keyframes", completedUnits: 0, totalUnits: 3 } }));
      const keyframes = await extractSegmentKeyframes(runtime.previewUrl, segment, (completedUnits, totalUnits) => {
        setAnalysisJobs((current) => ({ ...current, [segment.id]: { status: "preparing_keyframes", completedUnits, totalUnits } }));
      });
      setAnalysisJobs((current) => ({ ...current, [segment.id]: { status: "sending_to_ai", completedUnits: keyframes.length, totalUnits: keyframes.length } }));
      const requestBody = JSON.stringify({ segmentId: segment.id, videoId: segment.videoId, startTime: segment.startTime, endTime: segment.endTime, keyframes, priority: force ? "high" : "normal" });
      if (new TextEncoder().encode(requestBody).byteLength > MAX_ANALYZE_SEGMENT_REQUEST_BYTES) throw new Error("Segment analysis request exceeds the production payload limit.");
      const response = await fetch("/api/analyze-segment", { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody });
      if (!response.ok) {
        const data = await response.json() as { error?: string; code?: string };
        throw Object.assign(new Error(data.error ?? "视觉理解请求失败。"), { code: data.code });
      }
      if (!response.body) throw new Error("浏览器无法读取分析进度。");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: SegmentAnalysisResult | null = null;
      let streamedError: { code?: string; error?: string; technicalMessage?: string } | null = null;
      const handleLine = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as { type: "progress" | "result" | "error"; state?: "attempt" | "retrying" | "switching_model"; attempt?: number; maxAttempts?: number; category?: string; model?: string; previousModel?: string; result?: SegmentAnalysisResult; code?: string; error?: string; technicalMessage?: string };
        if (event.type === "progress") setAnalysisJobs((current) => ({ ...current, [segment.id]: { ...current[segment.id], status: event.state === "retrying" ? "retrying" : event.state === "switching_model" ? "switching_model" : "sending_to_ai", attempt: event.attempt, maxAttempts: event.maxAttempts, model: event.model, previousModel: event.previousModel, errorCode: event.category } }));
        if (event.type === "result" && event.result) result = event.result;
        if (event.type === "error") streamedError = event;
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        lines.forEach(handleLine);
        if (done) break;
      }
      if (buffer.trim()) handleLine(buffer);
      if (streamedError) {
        const failure = streamedError as { code?: string; error?: string; technicalMessage?: string };
        throw Object.assign(new Error(failure.error ?? "视觉理解失败。"), { code: failure.code, technicalMessage: failure.technicalMessage });
      }
      const finalResult = result as SegmentAnalysisResult | null;
      if (!finalResult) throw new Error("视觉理解没有返回结果。");
      setAnalysisJobs((current) => ({ ...current, [segment.id]: { ...current[segment.id], status: "validating_result" } }));
      if (finalResult.segmentId !== segment.id) throw new Error("分析结果与 Segment 不匹配。");
      setAnalysesBySegment((current) => ({ ...current, [segment.id]: finalResult }));
      setAnalysisJobs((current) => ({ ...current, [segment.id]: { status: "ready" } }));
    } catch (error) {
      const failure = error as Error & { code?: string; technicalMessage?: string };
      setAnalysisJobs((current) => ({ ...current, [segment.id]: { status: "error", error: failure.message || "视觉理解失败。", errorCode: failure.code, technicalMessage: failure.technicalMessage } }));
    } finally { analysisInFlight.current.delete(segment.id); }
  }, [aiConfiguration.status]);

  const analyzeAllSegments = useCallback(async () => {
    if (analysisBatchInFlight.current || aiConfiguration.status !== "configured") return;
    analysisBatchInFlight.current = true;
    try {
      const segments = selectAutomaticCandidates(assets.flatMap((asset) => segmentsByVideo[asset.id] ?? []), candidateScores);
      await runAnalysisQueue(segments, (segment) => Boolean(analysesRef.current[segment.id]), analyzeOne, SEGMENT_ANALYSIS_CONCURRENCY);
    } finally { analysisBatchInFlight.current = false; }
  }, [aiConfiguration.status, assets, segmentsByVideo, candidateScores, analyzeOne]);

  const reanalyzeSegment = useCallback(async (segment: VideoSegment) => { await analyzeOne(segment, true); }, [analyzeOne]);

  const discoverStories = useCallback(async (regenerate = false) => {
    if (storyDiscoveryInFlight.current || (!regenerate && storyCandidatesRef.current.length > 0)) return;
    const segments = assets.flatMap((asset) => segmentsByVideo[asset.id] ?? []);
    setStoryDiscovery({ status: "preparing" });
    const input = buildStoryDiscoveryInput(segments, candidateScores, analysesRef.current);
    if (input.length < MIN_STORY_DISCOVERY_ANALYZED_SEGMENTS) { setStoryDiscovery({ status: "error", error: `至少需要 ${MIN_STORY_DISCOVERY_ANALYZED_SEGMENTS} 个已理解的 high / medium 候选片段。` }); return; }
    storyDiscoveryInFlight.current = true;
    const controller = new AbortController(); storyDiscoveryAbort.current = controller;
    const candidateSegmentCount = segments.filter((segment) => { const score = candidateScores[segment.id]; return score?.tier === "high" || score?.tier === "medium"; }).length;
    const payload = JSON.stringify({ segments: input });
    const preview = { inputSegmentCount: input.length, payloadBytes: new TextEncoder().encode(payload).length, highCount: input.filter((item) => item.candidateTier === "high").length, mediumCount: input.filter((item) => item.candidateTier === "medium").length, candidateSegmentCount };
    setStoryDiscovery({ status: "discovering", ...preview });
    try {
      const response = await fetch("/api/discover-stories", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, signal: controller.signal });
      if (!response.ok) { const failure = await response.json() as { code?: string; failureStage?: string; error?: string; technicalMessage?: string }; throw Object.assign(new Error(failure.error ?? "暂时无法生成故事方向，可稍后重试。"), { code: failure.code, failureStage: failure.failureStage, technicalMessage: failure.technicalMessage }); }
      if (!response.body) throw new Error("浏览器无法读取故事发现进度。");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let result: StoryCandidate[] | null = null; let streamedError: { code?: string; failureStage?: string; error?: string; technicalMessage?: string } | null = null;
      const handleLine = (line: string) => { if (!line.trim()) return; const event = JSON.parse(line) as { type: "progress" | "result" | "error"; state?: "attempt" | "retrying" | "switching_model" | "waiting" | "cooldown" | "active"; model?: string; attempt?: number; maxAttempts?: number; active?: number; queued?: number; cooldownRemainingMs?: number; stories?: StoryCandidate[]; error?: string; technicalMessage?: string }; if (event.type === "progress") setStoryDiscovery((current) => ({ ...current, status: event.state === "retrying" ? "retrying" : event.state === "switching_model" ? "switching_model" : event.state === "waiting" ? "waiting" : event.state === "cooldown" ? "cooldown" : "discovering", model: event.model, attempt: event.attempt, maxAttempts: event.maxAttempts, activeRequests: event.active, queuedRequests: event.queued, cooldownUntil: event.cooldownRemainingMs ? Date.now() + event.cooldownRemainingMs : current.cooldownUntil })); if (event.type === "result" && event.stories) result = event.stories; if (event.type === "error") streamedError = event; };
      while (true) { const { done, value } = await reader.read(); buffer += decoder.decode(value, { stream: !done }); const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; lines.forEach(handleLine); if (done) break; }
      if (buffer.trim()) handleLine(buffer); const failure = streamedError as { code?: string; failureStage?: string; error?: string; technicalMessage?: string } | null; if (failure) throw Object.assign(new Error(failure.error ?? "暂时无法生成故事方向，可稍后重试。"), { code: failure.code, failureStage: failure.failureStage, technicalMessage: failure.technicalMessage });
      const finalStories = result as StoryCandidate[] | null; if (!finalStories?.length) throw new Error("没有返回可用的故事方向。");
      const coverage = { analyzedSegments: input.length, candidateSegments: candidateSegmentCount, coverageRatio: candidateSegmentCount ? input.length / candidateSegmentCount : 1 };
      const coveredStories = finalStories.map((story) => ({ ...story, analysisCoverage: coverage }));
      setStoryCandidates(coveredStories); setSelectedStoryCandidateId((current) => coveredStories.some((story) => story.id === current) ? current : null); setStoryDiscovery({ status: "ready", ...preview, model: coveredStories[0].model });
    } catch (error) { if (controller.signal.aborted) { setStoryDiscovery({ status: "idle" }); return; } const failure = error as Error & { code?: string; failureStage?: string; technicalMessage?: string }; const diagnostic = process.env.NODE_ENV === "development" ? [failure.code && `错误类型：${failure.code}`, failure.failureStage && `阶段：${failure.failureStage}`, failure.technicalMessage && `技术信息：${failure.technicalMessage}`].filter(Boolean).join(" · ") : ""; setStoryDiscovery((current) => ({ ...current, status: "error", ...preview, error: [failure.message || "暂时无法生成故事方向，可稍后重试。", diagnostic].filter(Boolean).join("\n"), errorCode: failure.code, failureStage: failure.failureStage, technicalMessage: failure.technicalMessage })); }
    finally { storyDiscoveryInFlight.current = false; if (storyDiscoveryAbort.current === controller) storyDiscoveryAbort.current = null; }
  }, [assets, segmentsByVideo, candidateScores]);

  const cancelStoryDiscovery = useCallback(() => { storyDiscoveryAbort.current?.abort(); storyDiscoveryAbort.current = null; storyDiscoveryInFlight.current = false; setStoryDiscovery({ status: "idle" }); }, []);

  const selectStoryCandidate = useCallback((id: string) => { if (storyCandidatesRef.current.some((story) => story.id === id)) { setSelectedStoryCandidateId(id); setEditingPlan((current) => current?.storyId === id ? current : null); setEditingPlanState({ status: "idle" }); } }, []);

  const generateEditingPlan = useCallback(async (regenerate = false) => {
    if (editingPlanInFlight.current || (!regenerate && editingPlan)) return;
    const story = storyCandidatesRef.current.find((item) => item.id === selectedStoryCandidateId); if (!story) { setEditingPlanState({ status: "error", error: "请先选择一个故事方向。" }); return; }
    editingPlanInFlight.current = true; setEditingPlanState({ status: "preparing" });
    try {
      const input = buildEditingPlanInput(story, assets.flatMap((asset) => segmentsByVideo[asset.id] ?? []), assets, analysesRef.current, candidateScores);
      const plan = generateLocalEditingPlan(input); setEditingPlan(plan); setEditingPlanState({ status: "ready", model: plan.model });
    } catch (error) { setEditingPlanState({ status: "error", error: error instanceof Error ? error.message : "暂时无法生成剪辑方案，可稍后重试。" }); }
    finally { editingPlanInFlight.current = false; }
  }, [editingPlan, selectedStoryCandidateId, assets, segmentsByVideo, candidateScores]);
  useEffect(() => { if (selectedStoryCandidateId && !editingPlan) void generateEditingPlan(); }, [selectedStoryCandidateId, editingPlan, generateEditingPlan]);
  const removeEditingPlanItem = useCallback((id: string) => setEditingPlan((current) => { if (!current) return current; const timelineItems = recalculateTimeline(current.timelineItems.filter((item) => item.id !== id)); const duration = timelineItems.at(-1)?.timelineEnd ?? 0; return { ...current, timelineItems, totalDuration: duration, estimatedFinalDuration: duration }; }), []);
  const moveEditingPlanItem = useCallback((id: string, direction: -1 | 1) => setEditingPlan((current) => { if (!current) return current; const index = current.timelineItems.findIndex((item) => item.id === id); const target = index + direction; if (index < 0 || target < 0 || target >= current.timelineItems.length) return current; const items = [...current.timelineItems]; [items[index], items[target]] = [items[target], items[index]]; const timelineItems = recalculateTimeline(items); const duration = timelineItems.at(-1)?.timelineEnd ?? 0; return { ...current, timelineItems, totalDuration: duration, estimatedFinalDuration: duration }; }), []);

  const value = useMemo(() => ({ assets, runtimeUrls, notice, addFiles, removeAsset, segmentsByVideo, segmentThumbnailUrls, segmentationJobs, segmentAll, analysesBySegment, analysisJobs, aiConfiguration, analyzeAllSegments, reanalyzeSegment, candidateScores, candidateDiscovery, discoverCandidates, storyCandidates, storyDiscovery, discoverStories, cancelStoryDiscovery, selectedStoryCandidateId, selectStoryCandidate, editingPlan, editingPlanState, generateEditingPlan, removeEditingPlanItem, moveEditingPlanItem }), [assets, runtimeUrls, notice, addFiles, removeAsset, segmentsByVideo, segmentThumbnailUrls, segmentationJobs, segmentAll, analysesBySegment, analysisJobs, aiConfiguration, analyzeAllSegments, reanalyzeSegment, candidateScores, candidateDiscovery, discoverCandidates, storyCandidates, storyDiscovery, discoverStories, cancelStoryDiscovery, selectedStoryCandidateId, selectStoryCandidate, editingPlan, editingPlanState, generateEditingPlan, removeEditingPlanItem, moveEditingPlanItem]);
  return <ProjectSessionContext.Provider value={value}>{children}</ProjectSessionContext.Provider>;
}

export function useProjectSession() {
  const context = useContext(ProjectSessionContext);
  if (!context) throw new Error("useProjectSession must be used inside ProjectSessionProvider");
  return context;
}

export const segmentationConfig = { sceneThreshold: SCENE_THRESHOLD, minSegmentDuration: MIN_SEGMENT_DURATION, maxSegmentDuration: MAX_SEGMENT_DURATION };
