import type { CandidateTier } from "@/domain/types";

export const candidateTierLabels: Record<CandidateTier, string> = {
  high: "优先看看",
  medium: "可能值得用",
  low: "补充素材",
  archive: "其余素材",
};
