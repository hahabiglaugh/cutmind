import type { StoryBeatType, StoryType } from "@/domain/types";

export const storyTypeLabels: Record<StoryType, string> = { emotional: "情绪记录", informational: "信息分享", experience: "体验型", aesthetic: "氛围感", character: "人物型", discovery: "探索发现", mixed: "综合型" };
export const storyBeatLabels: Record<StoryBeatType, string> = { hook: "开场", setup: "铺垫", development: "发展", contrast: "对比", peak: "高潮", transition: "转场", ending: "结尾" };
