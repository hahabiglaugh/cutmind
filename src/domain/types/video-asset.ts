import type { ProcessingStatus, Seconds } from "./shared";

export interface VideoAsset {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  duration: Seconds | null;
  width: number | null;
  height: number | null;
  /** Reserved for a future durable URL. Browser object URLs never belong here. */
  thumbnailUrl: string | null;
  status: ProcessingStatus;
  error?: string;
  createdAt: string;
}
