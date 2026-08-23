import type { AnalysisRole, CameraBehavior } from "@/domain/types";

export const analysisRoleLabels: Record<AnalysisRole, string> = {
  hook: "开场钩子",
  context: "场景铺垫",
  story_progression: "推进故事",
  reaction: "人物反应",
  conflict: "冲突",
  reveal: "揭示",
  transition: "转场",
  b_roll: "补充镜头",
  ending: "结尾",
  unclear: "暂不明确",
};

export const cameraBehaviorLabels: Record<CameraBehavior, string> = {
  static: "固定镜头",
  pan: "横向移动",
  tilt: "上下移动",
  handheld: "手持拍摄",
  tracking: "跟拍",
  zoom: "变焦",
  unknown: "未识别",
};
