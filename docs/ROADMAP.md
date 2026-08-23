# CutMind Roadmap

Each phase builds on the segment-first domain model. A later phase begins only after the previous phase has been validated.

## Phase 0 — Foundation

Project setup, strict domain types, provider-neutral service contracts, landing/upload UI, future project route, and architecture documentation. No real upload or analysis.

## Phase 1 — Video Upload & Metadata

**Current:** browser-local multi-file ingestion, validation, metadata extraction, thumbnail capture, preview, removal, and batch summaries. Cloud/server upload and persistence are intentionally not included.

## Phase 2 — Video Segmentation

**Completed:** browser-local visual-change detection, boundary cleanup, deterministic minimum/maximum duration handling, precise `VideoSegment` creation, midpoint thumbnails, segment strip, and bounded segment preview.

**Phase 2.1 completed:** real frame and thumbnail work-unit progress, sequential batch feedback, current-file/stage reporting, terminal error accounting, and persistent 100% completion summary.

## Phase 3 — Segment Understanding

**Completed (visual scope):** explicit opt-in keyframe extraction, server-side provider abstraction and Gemini adapter, strict structured visual results, per-Segment progress/error/re-analysis, and browser-session caching. Speech transcription remains future work and is not simulated.

**Phase 3.5 completed:** browser-local candidate scoring, explainable priority tiers, bounded duplicate comparison, limited local concurrency, and a high/medium-only automatic Gemini queue with manual analysis preserved for every Segment.

## Phase 4 — Story Discovery

**Completed:** deterministic text-only input compression, one logical Gemini request for 1–3 meaningfully different structured story directions, real Segment-reference validation, Chinese Story UI, browser-session caching, explicit regeneration, and selection-only user control. Editing Plan remains out of scope.

## Phase 5 — Editing Plan

Re-evaluate segments for a chosen story and generate a precise, structured source-to-timeline plan.

## Phase 6 — Real Creator Testing

Test with working creators, measure recommendation usefulness, and refine the editorial model and workflow.

## Phase 7 — Rough Cut

Generate a reviewable rough cut from an approved editing plan.

## Phase 8 — AI Editing Copilot

Conversational editing changes that update structured plans and timelines while preserving source traceability.
