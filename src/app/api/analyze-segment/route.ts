import { NextResponse } from "next/server";
import { FALLBACK_GEMINI_MODELS, PRIMARY_GEMINI_MODEL } from "@/server/vision/config";
import { ConfiguredVisionProvider, visionConfiguration } from "@/server/vision/configured-vision-provider";
import type { AnalyzeSegmentInput } from "@/server/vision/vision-analysis-provider";
import { AiProviderError, publicErrorMessage } from "@/server/vision/ai-provider-error";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ ...visionConfiguration(), fallbackModels: FALLBACK_GEMINI_MODELS });
}

function validRequest(value: unknown): value is AnalyzeSegmentInput {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AnalyzeSegmentInput>;
  if (![item.segmentId, item.videoId].every((id) => typeof id === "string" && id.length > 0)) return false;
  if (![item.startTime, item.endTime].every(Number.isFinite) || item.endTime! <= item.startTime!) return false;
  if (!Array.isArray(item.keyframes) || item.keyframes.length < 1 || item.keyframes.length > 4) return false;
  return item.keyframes.every((frame) => frame.segmentId === item.segmentId && frame.videoId === item.videoId && Number.isFinite(frame.timestamp) && frame.timestamp >= item.startTime! - 0.05 && frame.timestamp <= item.endTime! + 0.05 && ["image/jpeg", "image/png"].includes(frame.mimeType) && typeof frame.data === "string" && frame.data.length > 0);
}

export async function POST(request: Request) {
  const configuration = visionConfiguration();
  if (!configuration.configured) return NextResponse.json({ code: "AI_NOT_CONFIGURED", error: configuration.provider === "qwen" ? "请在 .env.local 中配置 DASHSCOPE_API_KEY。" : "请在 .env.local 中配置 GEMINI_API_KEY。" }, { status: 503 });
  try {
    const body: unknown = await request.json();
    if (!validRequest(body)) return NextResponse.json({ code: "AI_BAD_REQUEST", error: "Segment 或关键帧数据无效。" }, { status: 400 });
    const totalBytes = body.keyframes.reduce((sum, frame) => sum + frame.data.length * 0.75, 0);
    if (totalBytes > 12 * 1024 * 1024) return NextResponse.json({ code: "AI_BAD_REQUEST", error: "关键帧数据过大。" }, { status: 413 });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        void new ConfiguredVisionProvider({ qwen: process.env.DASHSCOPE_API_KEY, gemini: process.env.GEMINI_API_KEY }, configuration.provider).analyzeSegment(body, (event) => send({ type: "progress", ...event }))
          .then((result) => send({ type: "result", result }))
          .catch((error) => {
            const providerError = error instanceof AiProviderError ? error : new AiProviderError("PROVIDER_ERROR", "Unknown provider error", false);
            console.error("Segment analysis failed", { primaryModel: PRIMARY_GEMINI_MODEL, fallbackModels: FALLBACK_GEMINI_MODELS, category: providerError.code, httpStatus: providerError.httpStatus });
            send({ type: "error", code: providerError.code, error: publicErrorMessage(providerError.code), technicalMessage: process.env.NODE_ENV === "development" ? providerError.message : undefined });
          }).finally(() => controller.close());
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Segment understanding failed.";
    console.error("Segment analysis failed:", message);
    return NextResponse.json({ code: "AI_BAD_REQUEST", error: "无法读取分析请求。" }, { status: 400 });
  }
}
