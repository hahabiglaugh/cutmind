import assert from "node:assert/strict";
import test from "node:test";
import { AiProviderError, classifyHttpError } from "../src/server/vision/ai-provider-error.ts";
import { withGeminiRetry } from "../src/server/vision/gemini-retry-policy.ts";
import { runAnalysisQueue } from "../src/features/analysis/sequential-analysis-queue.ts";
import { withModelFallback } from "../src/server/vision/gemini-model-chain.ts";
import { GEMINI_MODEL_CHAIN } from "../src/server/vision/config.ts";

const noWait = { sleep: async () => {}, random: () => 0.5 };

test("503 retries and then succeeds", async () => {
  let calls = 0;
  const result = await withGeminiRetry(async () => { calls += 1; if (calls === 1) throw classifyHttpError(503); return "ok"; }, undefined, noWait);
  assert.equal(result, "ok"); assert.equal(calls, 2);
});

test("continuous 503 stops after three total attempts", async () => {
  let calls = 0;
  await assert.rejects(withGeminiRetry(async () => { calls += 1; throw classifyHttpError(503); }, undefined, noWait), (error: unknown) => error instanceof AiProviderError && error.code === "AI_UNAVAILABLE");
  assert.equal(calls, 3);
});

test("timeout retries", async () => {
  let calls = 0;
  await withGeminiRetry(async () => { calls += 1; if (calls === 1) throw new AiProviderError("AI_TIMEOUT", "timeout", true); return true; }, undefined, noWait);
  assert.equal(calls, 2);
});

test("429 retries", async () => {
  let calls = 0;
  await withGeminiRetry(async () => { calls += 1; if (calls === 1) throw classifyHttpError(429); return true; }, undefined, noWait);
  assert.equal(calls, 2);
});

for (const status of [400, 401, 403]) test(`${status} does not retry`, async () => {
  let calls = 0;
  await assert.rejects(withGeminiRetry(async () => { calls += 1; throw classifyHttpError(status); }, undefined, noWait));
  assert.equal(calls, 1);
});

test("queue continues after one Segment fails and skips completed Segments", async () => {
  const calls: number[] = [];
  await runAnalysisQueue([1, 2, 3], (id) => id === 1, async (id) => { calls.push(id); if (id === 2) throw new Error("failed"); }, 3);
  assert.deepEqual(calls, [2, 3]);
});

test("primary success never calls fallback and records the primary model", async () => {
  const calls: string[] = [];
  const result = await withModelFallback(GEMINI_MODEL_CHAIN, async (model) => { calls.push(model); return { model }; });
  assert.deepEqual(calls, ["gemini-3.7-flash"]); assert.equal(result.model, "gemini-3.7-flash");
});

for (const [name, primaryError] of [
  ["continuous 503", classifyHttpError(503)],
  ["timeout", new AiProviderError("AI_TIMEOUT", "timeout", true)],
  ["429", classifyHttpError(429)],
] as const) test(`primary ${name} falls back and records the fallback model`, async () => {
  const calls: string[] = [];
  const result = await withModelFallback(GEMINI_MODEL_CHAIN, async (model) => {
    return withGeminiRetry(async () => { calls.push(model); if (model === "gemini-3.7-flash") throw primaryError; return { model }; }, undefined, noWait);
  });
  assert.equal(calls.filter((model) => model === "gemini-3.7-flash").length, 3);
  assert.equal(calls.at(-1), "gemini-3.6-flash");
  assert.equal(result.model, "gemini-3.6-flash");
});

for (const status of [400, 401]) test(`primary ${status} does not fall back`, async () => {
  const calls: string[] = [];
  await assert.rejects(withModelFallback(GEMINI_MODEL_CHAIN, async (model) => { calls.push(model); throw classifyHttpError(status); }));
  assert.deepEqual(calls, ["gemini-3.7-flash"]);
});

test("both models failing produces a final Segment error", async () => {
  const calls: string[] = [];
  await assert.rejects(withModelFallback(GEMINI_MODEL_CHAIN, async (model) => withGeminiRetry(async () => { calls.push(model); throw classifyHttpError(503); }, undefined, noWait)));
  assert.equal(calls.length, 6);
});

test("queue continues after fallback failure and skips an already successful Segment", async () => {
  const processed: number[] = [];
  await runAnalysisQueue([1, 2, 3], (id) => id === 1, async (id) => {
    processed.push(id);
    await withModelFallback(GEMINI_MODEL_CHAIN, async () => { if (id === 2) throw classifyHttpError(503); return id; });
  }, 3);
  assert.deepEqual(processed, [2, 3]);
});

test("analysis queue never exceeds concurrency three", async () => {
  let active = 0; let maximum = 0;
  await runAnalysisQueue([1, 2, 3, 4, 5, 6], () => false, async () => {
    active += 1; maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
  }, 3);
  assert.equal(maximum, 3);
});
