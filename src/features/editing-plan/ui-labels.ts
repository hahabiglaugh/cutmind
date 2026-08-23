import type { EditingPace, EditingPlanRole } from "../../domain/types/index.ts";
export const editingRoleLabels: Record<EditingPlanRole, string> = { hook: "开场钩子", setup: "铺垫", context: "背景", story_progression: "故事推进", reaction: "人物反应", contrast: "对比", reveal: "揭示", transition: "转场", b_roll: "补充画面", peak: "高潮", ending: "结尾" };
export const editingPaceLabels: Record<EditingPace, string> = { fast: "快节奏", medium: "正常", slow: "慢节奏" };
