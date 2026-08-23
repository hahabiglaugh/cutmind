/** Histogram distance required between consecutive samples to mark a shot boundary. */
export const SCENE_THRESHOLD = 0.28;

/** Sampling interval controls temporal precision and browser processing cost. */
export const FRAME_SAMPLE_INTERVAL = 0.5;

/** Shorter scenes are deterministically merged with an adjacent scene. */
export const MIN_SEGMENT_DURATION = 1;

/** Long scenes are split uniformly to bound future per-segment processing cost. */
export const MAX_SEGMENT_DURATION = 15;

export const SEGMENTATION_CONCURRENCY = 1;
