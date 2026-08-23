import { DEFAULT_RATE_LIMIT_COOLDOWN_MS, GEMINI_GLOBAL_CONCURRENCY, MAX_RATE_LIMIT_COOLDOWN_MS } from "./config.ts";

export type GeminiRequestType = "segment_analysis" | "story_discovery" | "editing_plan" | "manual_segment_analysis";
export type GeminiRequestPriority = "high" | "normal";
export interface GeminiSchedulerSnapshot { active: number; queued: number; cooldownUntil: number | null; queuedByType: Partial<Record<GeminiRequestType, number>> }
export interface GeminiSchedulerEvent extends GeminiSchedulerSnapshot { state: "waiting" | "cooldown" | "active"; requestType: GeminiRequestType; cooldownRemainingMs?: number }
interface QueueItem<T> { id: number; priority: GeminiRequestPriority; type: GeminiRequestType; task: () => Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void; signal?: AbortSignal; onEvent?: (event: GeminiSchedulerEvent) => void; abort?: () => void }

export class GeminiRequestScheduler {
  private active = 0;
  private activeStoryRequests = 0;
  private sequence = 0;
  private queue: QueueItem<unknown>[] = [];
  private cooldownUntil = 0;
  private consecutiveRateLimits = 0;
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly concurrency: number;
  private readonly now: () => number;
  private readonly setTimer: typeof setTimeout;

  constructor(concurrency = GEMINI_GLOBAL_CONCURRENCY, now = Date.now, setTimer: typeof setTimeout = setTimeout) { this.concurrency = concurrency; this.now = now; this.setTimer = setTimer; }

  schedule<T>(type: GeminiRequestType, priority: GeminiRequestPriority, task: () => Promise<T>, options: { signal?: AbortSignal; onEvent?: (event: GeminiSchedulerEvent) => void } = {}): Promise<T> {
    if (options.signal?.aborted) return Promise.reject(new DOMException("Request cancelled", "AbortError"));
    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = { id: ++this.sequence, type, priority, task, resolve, reject, signal: options.signal, onEvent: options.onEvent };
      item.abort = () => { const index = this.queue.indexOf(item as QueueItem<unknown>); if (index >= 0) { this.queue.splice(index, 1); reject(new DOMException("Request cancelled", "AbortError")); this.drain(); } };
      options.signal?.addEventListener("abort", item.abort, { once: true });
      this.queue.push(item as QueueItem<unknown>);
      this.queue.sort((a, b) => (a.priority === b.priority ? a.id - b.id : a.priority === "high" ? -1 : 1));
      this.emit(item as QueueItem<unknown>, this.cooldownUntil > this.now() ? "cooldown" : "waiting");
      this.drain();
    });
  }

  enterRateLimitCooldown(retryAfterMs?: number) {
    this.consecutiveRateLimits += 1;
    const exponential = Math.min(MAX_RATE_LIMIT_COOLDOWN_MS, DEFAULT_RATE_LIMIT_COOLDOWN_MS * 2 ** (this.consecutiveRateLimits - 1));
    const delay = Math.min(MAX_RATE_LIMIT_COOLDOWN_MS, Math.max(0, retryAfterMs ?? exponential));
    this.cooldownUntil = Math.max(this.cooldownUntil, this.now() + delay);
    this.queue.forEach((item) => this.emit(item, "cooldown"));
    this.scheduleWake();
    return delay;
  }

  recordSuccess() { this.consecutiveRateLimits = 0; }
  snapshot(): GeminiSchedulerSnapshot {
    const queuedByType: GeminiSchedulerSnapshot["queuedByType"] = {};
    this.queue.forEach((item) => { queuedByType[item.type] = (queuedByType[item.type] ?? 0) + 1; });
    return { active: this.active, queued: this.queue.length, cooldownUntil: this.cooldownUntil > this.now() ? this.cooldownUntil : null, queuedByType };
  }

  private emit(item: QueueItem<unknown>, state: GeminiSchedulerEvent["state"]) { const snapshot = this.snapshot(); item.onEvent?.({ ...snapshot, state, requestType: item.type, cooldownRemainingMs: snapshot.cooldownUntil ? Math.max(0, snapshot.cooldownUntil - this.now()) : undefined }); }
  private scheduleWake() { if (this.wakeTimer) clearTimeout(this.wakeTimer); const delay = Math.max(0, this.cooldownUntil - this.now()); this.wakeTimer = this.setTimer(() => { this.wakeTimer = null; this.drain(); }, delay); }
  private drain() {
    if (this.cooldownUntil > this.now()) { this.scheduleWake(); return; }
    this.cooldownUntil = 0;
    while (this.active < this.concurrency && this.queue.length) {
      const next = this.queue[0];
      if (this.activeStoryRequests > 0) return;
      if (next.type === "story_discovery" && this.active > 0) return;
      const item = this.queue.shift()!;
      item.signal?.removeEventListener("abort", item.abort!);
      if (item.signal?.aborted) { item.reject(new DOMException("Request cancelled", "AbortError")); continue; }
      this.active += 1; if (item.type === "story_discovery") this.activeStoryRequests += 1; this.emit(item, "active");
      void item.task().then(item.resolve, item.reject).finally(() => { this.active -= 1; if (item.type === "story_discovery") this.activeStoryRequests -= 1; this.drain(); });
    }
  }
}

export const globalGeminiScheduler = new GeminiRequestScheduler();
export { GeminiRequestScheduler as AIRequestScheduler };
export const globalAIRequestScheduler = globalGeminiScheduler;
export type AIRequestType = GeminiRequestType;
export type AIRequestPriority = GeminiRequestPriority;
export type AISchedulerEvent = GeminiSchedulerEvent;
