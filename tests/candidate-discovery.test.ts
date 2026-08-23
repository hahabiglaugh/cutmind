import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { brightnessQuality, duplicatePenaltyForSimilarity, fingerprintSimilarity, scoreCandidate, selectAutomaticCandidates, sharpnessFromLuminance, tierForScore } from "../src/features/candidate-discovery/candidate-scoring.ts";
import { MAX_AUTO_AI_CANDIDATES } from "../src/features/candidate-discovery/config.ts";
import type { SegmentCandidateScore } from "../src/domain/types/segment-candidate-score.ts";

const timestamp = "2026-08-22T00:00:00.000Z";
test("candidate score is deterministic", () => assert.deepEqual(scoreCandidate("s", { visualChangeScore: 60, motionScore: 70, sharpnessScore: 80, brightnessScore: 90 }, 0, timestamp), scoreCandidate("s", { visualChangeScore: 60, motionScore: 70, sharpnessScore: 80, brightnessScore: 90 }, 0, timestamp)));
test("missing metrics renormalize available weights", () => assert.equal(scoreCandidate("s", { sharpnessScore: 80 }, 0, timestamp).overallScore, 80));
test("candidate score clamps to 0 through 100", () => { assert.equal(scoreCandidate("s", { sharpnessScore: 200 }, 0, timestamp).overallScore, 100); assert.equal(scoreCandidate("s", { sharpnessScore: -50 }, 90, timestamp).overallScore, 0); });
test("static frames receive a static penalty", () => assert.ok(scoreCandidate("s", { visualChangeScore: 0, motionScore: 0, sharpnessScore: 80 }, 0, timestamp).staticPenalty > 0));
test("identical fingerprints receive duplicate penalty", () => { const frame = new Uint8Array([10, 20, 30]); assert.equal(fingerprintSimilarity(frame, frame), 1); assert.ok(duplicatePenaltyForSimilarity(1) > 0); });
test("normal brightness scores above a severely dark frame", () => assert.ok(brightnessQuality(128) > brightnessQuality(2)));
test("edge-rich frame scores sharper than a flat frame", () => { const flat = new Uint8Array(25).fill(100); const edges = new Uint8Array(Array.from({ length: 25 }, (_, index) => index % 2 ? 255 : 0)); assert.ok(sharpnessFromLuminance(edges, 5, 5) > sharpnessFromLuminance(flat, 5, 5)); });
test("tier thresholds match product rules", () => { assert.equal(tierForScore(75), "high"); assert.equal(tierForScore(55), "medium"); assert.equal(tierForScore(35), "low"); assert.equal(tierForScore(34), "archive"); });

function candidate(id: string, score: number): SegmentCandidateScore { return { segmentId: id, overallScore: score, duplicatePenalty: 0, staticPenalty: 0, confidence: 0.75, reasons: [], tier: tierForScore(score), scoredAt: timestamp }; }
test("only high and medium tiers enter automatic Gemini selection", () => { const segments = ["h", "m", "l", "a"].map((id) => ({ id })); const scores = { h: candidate("h", 80), m: candidate("m", 60), l: candidate("l", 40), a: candidate("a", 20) }; assert.deepEqual(selectAutomaticCandidates(segments, scores).map(({ id }) => id), ["h", "m"]); });
test("automatic Gemini selection respects its safety cap", () => { const segments = Array.from({ length: 80 }, (_, index) => ({ id: `s${index}` })); const scores = Object.fromEntries(segments.map(({ id }) => [id, candidate(id, 80)])); assert.equal(selectAutomaticCandidates(segments, scores).length, MAX_AUTO_AI_CANDIDATES); });
test("candidate discovery browser service has no external API call", () => { const source = readFileSync(new URL("../src/features/candidate-discovery/browser-candidate-scoring.ts", import.meta.url), "utf8"); assert.doesNotMatch(source, /\bfetch\s*\(/); });
test("Candidate Score remains independent from audienceAppeal", () => assert.equal("audienceAppeal" in candidate("s", 80), false));
test("manual Segment analysis is not gated by candidate tier", () => { const source = readFileSync(new URL("../src/features/project/project-session-context.tsx", import.meta.url), "utf8"); assert.match(source, /reanalyzeSegment[\s\S]*analyzeOne\(segment, true\)/); });
test("candidate discovery does not clear successful Gemini analyses", () => { const source = readFileSync(new URL("../src/features/project/project-session-context.tsx", import.meta.url), "utf8"); const discovery = source.slice(source.indexOf("const discoverCandidates"), source.indexOf("const analyzeOne")); assert.doesNotMatch(discovery, /setAnalysesBySegment/); });
