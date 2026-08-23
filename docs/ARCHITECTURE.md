# CutMind Architecture

## Core product principle

> **Video is not the smallest unit. Segment is.**

A video file is only a container. A 40-second recording can contain unusable camera movement, a strong establishing shot, a potential hook, repeated content, and useful B-roll. Judging the file as one indivisible object destroys the time-level detail needed to make good editorial decisions.

CutMind therefore uses this domain chain:

```text
Video → Segment → Story → Editing Plan
```

This is the system's most important data structure because every downstream result must remain traceable to an exact interval in the source footage.

## Domain flow

### Video

`VideoAsset` represents the source file and its technical metadata. It is not itself the unit of editorial meaning.

### Segment

`VideoSegment` references one source video with fractional-second `startTime` and `endTime` values. It is the unit that can later carry transcription, visual description, subjects, actions, quality/value scores, and possible editorial roles.

All time values use seconds as `number`, so boundaries such as `10.24` are representable. Implementations must preserve the invariant `startTime < endTime`, with `duration = endTime - startTime`.

### Story

`StoryCandidate` is discovered from a collection of segments, not directly from whole videos. It contains a structured angle, hook, audience, reasons, score, recommended segment references, and story structure. A story does not own or duplicate media; it refers back to segment IDs.

### Editing Plan

`EditingPlan` turns a selected story into ordered `EditingPlanItem` records. Every item maps an exact source interval (`sourceVideoId`, `sourceStart`, `sourceEnd`) to an exact timeline interval and editorial role.

## Boundaries

- `src/domain/types` contains framework-independent, structured data contracts.
- `src/domain/services` contains provider-neutral interfaces for future video processing, segment analysis, story discovery, and editing-plan generation.
- `src/app` and `src/components` contain presentation only and do not know about AI vendors or video-processing implementations.
- Future model outputs must be validated and mapped into domain types before reaching the UI.

The core service boundary remains provider-neutral. Phase 3 supplies a `GeminiVisionProvider` adapter behind that boundary; a future `LocalVisionProvider` or another hosted adapter can replace it without rewriting the UI or domain contracts.

## Browser runtime media references

`File`, `Blob`, and `blob:` object URLs are browser-runtime resources, not persistent domain data. They are deliberately kept out of `VideoAsset` because:

- a `File` is tied to the current browser session and cannot be serialized as a durable project record;
- an object URL is only a temporary pointer owned by the page that created it;
- storing either in a future database would produce invalid, device-specific references;
- object URLs hold memory until explicitly released.

Phase 1 keeps these resources in a client-only `Map<videoAssetId, LocalVideoRuntime>`. The map owns the original `File`, playback URL, and generated-thumbnail URL. Removal and component teardown revoke every owned object URL. `VideoAsset.thumbnailUrl` remains `null` in this phase and is reserved for a future durable asset URL.

## Phase 1 scope

The landing page selects real local MP4, MOV, and WebM files, reads browser-provided metadata, captures a thumbnail frame, and provides local playback. Nothing is uploaded. Refreshing the page ends the local session. Segmentation, analysis, and stories remain future work.

## Video Segmentation Pipeline

Phase 2 converts a ready `VideoAsset` into precise `VideoSegment` records entirely inside the browser:

```text
Scene Detection
→ Boundary Cleanup
→ Segment Creation
→ Segment Thumbnail
```

### Scene Detection

The current Windows environment has no FFmpeg or ffprobe installation, so Phase 2 uses a dependency-free browser pipeline rather than downloading an unknown binary. An `HTMLVideoElement` seeks through the real local video at 0.5-second intervals. Each frame is downscaled to 64 × 36 and converted to a normalized RGB color histogram. A histogram distance of at least `SCENE_THRESHOLD` marks a significant visual change.

This is deterministic local scene detection, not AI content understanding. Its temporal precision is bounded by the sampling interval and normal browser seek accuracy.

### Boundary Cleanup

Raw boundaries are sorted, de-duplicated, and clamped to the source duration. Scenes shorter than `MIN_SEGMENT_DURATION` are merged predictably: into the previous segment when possible, otherwise into the following segment. Scenes longer than `MAX_SEGMENT_DURATION` are uniformly split.

The resulting reason is recorded as `scene_boundary`, `merged_short_segment`, or `max_duration_split`.

### Segment Creation

Every segment preserves fractional-second `startTime` and `endTime`, calculates `duration`, and references its source with `videoId`. Future AI fields remain null or empty. A video with no detected boundary still produces at least one segment from 0 to its duration; maximum-duration splitting may then subdivide it.

### Segment Thumbnail

A real frame is captured at each segment midpoint. Segment thumbnail object URLs remain in the client runtime store and are revoked with their owning session. They are not domain or database fields.

### Session continuity and processing limits

The root React context owns domain records and runtime resources across ordinary Next.js route transitions, so moving from upload to `/project/[id]` does not discard local files. Refresh remains intentionally non-persistent. Videos are segmented sequentially (`SEGMENTATION_CONCURRENCY = 1`) to avoid unbounded decoding of many high-resolution files.

### Processing progress

Phase 2.1 exposes progress from real pipeline events. Frame detection reports `processedFrames / totalFrames` after every successful seek and histogram comparison. Segment creation reports its actual work step, and thumbnail generation reports `completedThumbnails / totalSegments`.

Each video divides progress into three real pipeline stages of equal weight: frame sampling/detection, boundary cleanup and Segment creation, and thumbnail generation. Progress within the frame and thumbnail stages uses actual completed work units. Ready and Error are both terminal so a failed video cannot permanently block the batch.

Overall progress is the arithmetic mean of every video's current progress. This naturally includes completed videos plus the current video's real internal progress. It contains no timer, ETA, or elapsed-time simulation. A batch-level mutex preserves sequential processing even when React development mode invokes effects more than once.

## Segment understanding

Phase 3 samples each real Segment at approximately 20%, 50%, and 80% of its own source interval (fewer frames for very short Segments). The browser downsizes those frames and sends only the chronological JPEG keyframes plus Segment timestamps to `/api/analyze-segment`. Full video files, browser `File` objects, and object URLs never cross this boundary.

The route selects a `VisionAnalysisProvider`; the current adapter calls Gemini from the server using `GEMINI_API_KEY`. The key is never exposed to client code. Provider output must match a strict JSON schema and pass application validation before it becomes `SegmentAnalysisResult`. A structurally invalid response gets one repair attempt. Network or provider errors remain attached to that Segment and do not block the remaining sequential queue.

Analysis results and jobs live only in the project browser context in Phase 3. Re-renders do not trigger paid calls, completed Segments are skipped, and re-analysis requires an explicit user action. Refreshing still clears the session.

### Privacy boundary

Gemini is a cloud processor: selected image frames leave the device when the user starts understanding. Before production, CutMind must document consent, provider retention/training terms, regional processing, deletion guarantees, and creator confidentiality. A future local provider can preserve the same structured contract for workflows that cannot send frames to a cloud service.

## Local candidate discovery

Phase 3.5 inserts a deterministic, zero-API-cost layer between Segmentation and Gemini understanding. Small browser Canvas samples measure frame change, motion desirability, Laplacian-style sharpness, exposure quality, and similarity to a bounded window of nearby Segment fingerprints. Available metric weights are normalized; missing optional metrics are never treated as zero.

`SegmentCandidateScore` is independent from `SegmentAnalysisResult`. Candidate Score means “worth prioritizing for expensive understanding,” while `audienceAppeal` remains a later Gemini judgment about a stranger's likely viewing interest. No Segment is removed. High and medium tiers enter the automatic Gemini queue, capped by `MAX_AUTO_AI_CANDIDATES`; every tier retains manual analysis.

## Story discovery

Phase 4 consumes only successful `SegmentAnalysisResult` records whose independent Candidate tier is high or medium. It never resends media. A deterministic diversity-aware selector compresses large projects to at most 40 structured text summaries, balancing character, information, emotion, transition, and visual material before calling one Gemini Story Discovery operation.

Gemini returns 1–3 strictly structured `StoryCandidate` records. Server validation rejects unknown Segment references, invalid beat structures, unsupported story types, and superficially duplicated directions. Suggested source times are normalized back to the complete real Segment boundaries; Phase 4 does not claim precise internal cut points. Candidates, selection state, Candidate Scores, and Segment Analyses remain separate browser-session state.
