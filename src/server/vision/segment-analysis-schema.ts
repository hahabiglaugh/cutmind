import type { AnalysisRole, CameraBehavior, SegmentAnalysisResult } from "../../domain/types/index.ts";

export const cameraBehaviors: CameraBehavior[] = ["static", "pan", "tilt", "handheld", "tracking", "zoom", "unknown"];
export const analysisRoles: AnalysisRole[] = ["hook", "context", "story_progression", "reaction", "conflict", "reveal", "transition", "b_roll", "ending", "unclear"];

const scoreSchema = { type: "integer", minimum: 0, maximum: 100 } as const;
export const segmentAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    visualDescription: { type: "string" },
    scene: { type: "string" },
    subjects: { type: "array", items: { type: "string" }, maxItems: 12 },
    actions: { type: "array", items: { type: "string" }, maxItems: 12 },
    cameraBehavior: { type: "string", enum: cameraBehaviors },
    visualQuality: scoreSchema,
    informationValue: scoreSchema,
    emotionalValue: scoreSchema,
    novelty: scoreSchema,
    audienceAppeal: scoreSchema,
    possibleRoles: { type: "array", items: { type: "string", enum: analysisRoles }, maxItems: 5 },
    momentSummary: { type: "string" },
  },
  required: ["visualDescription", "scene", "subjects", "actions", "cameraBehavior", "visualQuality", "informationValue", "emotionalValue", "novelty", "audienceAppeal", "possibleRoles", "momentSummary"],
} as const;

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const isScore = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;

export function validateSegmentAnalysis(value: unknown, metadata: Pick<SegmentAnalysisResult, "segmentId" | "provider" | "model" | "analyzedAt">): SegmentAnalysisResult {
  if (!value || typeof value !== "object") throw new Error("Analysis response is not an object");
  const item = value as Record<string, unknown>;
  const stringFields = ["visualDescription", "scene", "momentSummary"] as const;
  if (stringFields.some((field) => typeof item[field] !== "string" || !(item[field] as string).trim())) throw new Error("Analysis response has invalid text fields");
  if (!isStringArray(item.subjects) || !isStringArray(item.actions)) throw new Error("Analysis response has invalid subject/action arrays");
  if (typeof item.cameraBehavior !== "string" || !cameraBehaviors.includes(item.cameraBehavior as CameraBehavior)) throw new Error("Analysis response has invalid camera behavior");
  const scores = ["visualQuality", "informationValue", "emotionalValue", "novelty", "audienceAppeal"] as const;
  if (scores.some((field) => !isScore(item[field]))) throw new Error("Analysis response has invalid scores");
  if (!isStringArray(item.possibleRoles) || item.possibleRoles.some((role) => !analysisRoles.includes(role as AnalysisRole))) throw new Error("Analysis response has invalid roles");
  return { ...metadata, visualDescription: item.visualDescription as string, scene: item.scene as string, subjects: item.subjects, actions: item.actions, cameraBehavior: item.cameraBehavior as CameraBehavior, visualQuality: item.visualQuality as number, informationValue: item.informationValue as number, emotionalValue: item.emotionalValue as number, novelty: item.novelty as number, audienceAppeal: item.audienceAppeal as number, possibleRoles: item.possibleRoles as AnalysisRole[], momentSummary: item.momentSummary as string };
}
