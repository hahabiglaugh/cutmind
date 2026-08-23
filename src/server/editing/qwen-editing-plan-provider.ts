import type { EditingPlan } from "../../domain/types/index.ts";
import type { EditingPlanInput } from "../../features/editing-plan/editing-plan-input.ts";
import { QWEN_VISION_MODEL } from "../vision/qwen-config.ts";
import { requestQwenJson } from "../vision/qwen-json-request.ts";
import type { VisionAnalysisProgressEvent } from "../vision/vision-analysis-provider.ts";
import { editingPlanJsonSchema, validateEditingPlan } from "./editing-plan-schema.ts";

export const EDITING_PLAN_PROMPT = `你是 CutMind 的 AI 剪辑导演。用户已经选择一个真实素材支持的 Story Direction。把故事转换成可执行的短视频剪辑方案，不要重新构思故事。
只使用输入中的真实 Segment；不得编造素材、对白、地点、人物关系或不存在的 segmentId。保持顺序逻辑合理，优先用人物动作和变化作为节奏节点，静态环境适合作为短 B-roll，不因画面漂亮而长期停留。使用简体中文。
sourceStart/sourceEnd 只能位于对应 Segment 边界内；证据不足时使用完整 Segment 或保守整秒/十分之一秒 trim，不假装逐帧精确。每个 Segment 最多一次，单个片段至少 0.8 秒。timelineStart/timelineEnd 不要输出，由程序计算。目标总时长应在 Story estimatedDuration 的 ±20%。只返回符合此 JSON schema 的对象：${JSON.stringify(editingPlanJsonSchema)}`;
export class QwenEditingPlanProvider { readonly name = "qwen"; readonly model = QWEN_VISION_MODEL; private readonly apiKey: string; private readonly fetcher?: typeof fetch; private readonly sleep?: (ms: number) => Promise<void>; constructor(apiKey: string, fetcher?: typeof fetch, sleep?: (ms: number) => Promise<void>) { this.apiKey = apiKey; this.fetcher = fetcher; this.sleep = sleep; } generate(input: EditingPlanInput, onProgress?: (event: VisionAnalysisProgressEvent) => void, signal?: AbortSignal): Promise<EditingPlan> { return requestQwenJson({ apiKey: this.apiKey, prompt: EDITING_PLAN_PROMPT, payload: input, requestType: "editing_plan", onProgress, signal, fetcher: this.fetcher, sleep: this.sleep, validate: (value) => validateEditingPlan(value, input, { provider: this.name, model: this.model, createdAt: new Date().toISOString() }) }); } }
