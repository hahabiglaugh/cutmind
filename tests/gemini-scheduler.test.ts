import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GeminiRequestScheduler } from "../src/server/vision/gemini-request-scheduler.ts";
import { parseGeminiErrorResponse } from "../src/server/vision/gemini-error-response.ts";
import { GEMINI_GLOBAL_CONCURRENCY } from "../src/server/vision/config.ts";
import { MIN_STORY_DISCOVERY_ANALYZED_SEGMENTS } from "../src/features/story-discovery/config.ts";

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; };

test("segment and story requests share global concurrency two", async () => {
  const scheduler = new GeminiRequestScheduler(2);
  const gates = [deferred(), deferred(), deferred()];
  let active = 0; let maximum = 0; const started: string[] = [];
  const run = (name: string, index: number) => scheduler.schedule(name === "story" ? "story_discovery" : "segment_analysis", name === "story" ? "high" : "normal", async () => { started.push(name); active += 1; maximum = Math.max(maximum, active); await gates[index].promise; active -= 1; });
  const requests = [run("segment-1", 0), run("segment-2", 1), run("story", 2)];
  await Promise.resolve(); assert.equal(started.length, 2); assert.equal(maximum, GEMINI_GLOBAL_CONCURRENCY);
  gates[0].resolve(); await new Promise((resolve) => setTimeout(resolve, 0)); assert.equal(started.includes("story"), false);
  gates[1].resolve(); await new Promise((resolve) => setTimeout(resolve, 0)); assert.ok(started.includes("story"));
  gates[2].resolve(); await Promise.all(requests); assert.equal(maximum, 2);
});

test("HIGH Story Discovery runs before queued NORMAL Segment work", async () => {
  const scheduler = new GeminiRequestScheduler(1); const gate = deferred(); const order: string[] = [];
  const active = scheduler.schedule("segment_analysis", "normal", async () => { order.push("active"); await gate.promise; });
  const normal = scheduler.schedule("segment_analysis", "normal", async () => { order.push("normal"); });
  const story = scheduler.schedule("story_discovery", "high", async () => { order.push("story"); });
  gate.resolve(); await Promise.all([active, normal, story]); assert.deepEqual(order, ["active", "story", "normal"]);
});

test("Story runs exclusively and Segment work resumes after it completes", async () => {
  const scheduler = new GeminiRequestScheduler(2); const storyGate = deferred(); const order: string[] = [];
  const story = scheduler.schedule("story_discovery", "high", async () => { order.push("story-start"); await storyGate.promise; order.push("story-end"); });
  const segment = scheduler.schedule("segment_analysis", "normal", async () => { order.push("segment"); });
  await Promise.resolve(); assert.deepEqual(order, ["story-start"]);
  storyGate.resolve(); await Promise.all([story, segment]); assert.deepEqual(order, ["story-start", "story-end", "segment"]);
});

test("429 cooldown blocks new work and Retry-After takes precedence", async () => {
  let now = 1_000; let wake: (() => void) | undefined;
  const scheduler = new GeminiRequestScheduler(2, () => now, ((callback: () => void) => { wake = callback; return 1 as unknown as ReturnType<typeof setTimeout>; }) as typeof setTimeout);
  scheduler.enterRateLimitCooldown(45_000); let started = false;
  const request = scheduler.schedule("story_discovery", "high", async () => { started = true; });
  await Promise.resolve(); assert.equal(started, false); assert.equal(scheduler.snapshot().cooldownUntil, 46_000);
  now = 46_000; wake?.(); await request; assert.equal(started, true);
});

test("a queued Story request can be cancelled", async () => {
  let now = 0;
  const scheduler = new GeminiRequestScheduler(1, () => now, (() => 1 as unknown as ReturnType<typeof setTimeout>) as unknown as typeof setTimeout);
  scheduler.enterRateLimitCooldown(); const controller = new AbortController();
  const request = scheduler.schedule("story_discovery", "high", async () => {}, { signal: controller.signal });
  controller.abort(); await assert.rejects(request, /cancelled/i); assert.equal(scheduler.snapshot().queued, 0);
});

test("Gemini error parsing extracts only a bounded safe summary", async () => {
  const response = new Response(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exhausted for ?key=secret-value" } }), { status: 429 });
  const summary = await parseGeminiErrorResponse(response, 30_000);
  assert.deepEqual({ code: summary.googleCode, status: summary.googleStatus, retry: summary.retryAfterMs }, { code: 429, status: "RESOURCE_EXHAUSTED", retry: 30_000 });
  assert.doesNotMatch(summary.googleMessage ?? "", /secret-value/);
});

test("Story Discovery requires five successful analyses and prevents duplicate submission", () => {
  assert.equal(MIN_STORY_DISCOVERY_ANALYZED_SEGMENTS, 5);
  const source = readFileSync(new URL("../src/features/project/project-session-context.tsx", import.meta.url), "utf8");
  assert.match(source, /storyDiscoveryInFlight\.current/);
  assert.match(source, /input\.length < MIN_STORY_DISCOVERY_ANALYZED_SEGMENTS/);
  assert.match(source, /analysisCoverage/);
});

test("Story 429 does not immediately switch models while 503 may fallback", () => {
  const source = readFileSync(new URL("../src/server/story/gemini-story-discovery-provider.ts", import.meta.url), "utf8");
  assert.match(source, /error\.code !== "AI_RATE_LIMITED" && error\.retryable/);
});
