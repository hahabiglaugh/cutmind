export interface VisionBenchmarkEntry { provider: string; model: string; frameCount: number; attemptCount: number; durationMs: number; success: boolean; errorType?: string; fallbackUsed: boolean }
const entries: VisionBenchmarkEntry[] = [];
const percentile = (values: number[], ratio: number) => values.length ? values[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))] : 0;
export function recordVisionBenchmark(entry: VisionBenchmarkEntry) {
  if (process.env.NODE_ENV !== "development") return;
  entries.push(entry); if (entries.length > 500) entries.shift();
  const durations = entries.map((item) => item.durationMs).sort((a, b) => a - b);
  console.info("Vision benchmark", entry);
  console.info("Vision benchmark batch", { segmentCount: entries.length, successCount: entries.filter((item) => item.success).length, errorCount: entries.filter((item) => !item.success).length, totalDurationMs: durations.reduce((sum, value) => sum + value, 0), averageDurationMs: Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length), p50DurationMs: percentile(durations, 0.5), p95DurationMs: percentile(durations, 0.95) });
}
