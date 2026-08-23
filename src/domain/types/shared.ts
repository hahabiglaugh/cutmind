/** All media time values are expressed in seconds and may be fractional. */
export type Seconds = number;

/** Normalized score in the inclusive 0–100 range. */
export type Score = number;

export type ProcessingStatus =
  | "selected"
  | "reading_metadata"
  | "ready"
  | "error";
