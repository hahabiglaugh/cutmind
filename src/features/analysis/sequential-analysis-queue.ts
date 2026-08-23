export async function runAnalysisQueue<T>(items: T[], isCompleted: (item: T) => boolean, run: (item: T) => Promise<void>, concurrency: number) {
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      if (isCompleted(item)) continue;
      try { await run(item); } catch { /* One failed Segment must not stop other workers. */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker));
}
