import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class LearningError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}

export function requireKey(request: Request) {
  const key = request.headers.get("Idempotency-Key")?.trim();
  if (!key || key.length > 200) throw new LearningError("validation_error", "请提供 1–200 字符的 Idempotency-Key", 400);
  return key;
}

export async function learningResponse(work: () => Promise<unknown>, status = 200) {
  try {
    return NextResponse.json(await work(), { status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof LearningError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "validation_error", message: error instanceof ZodError ? error.issues.map(issue => issue.message).join("；") : "请求必须为有效 JSON" }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034", "P2028", "P1008"].includes(error.code)) return NextResponse.json({ error: "server_busy", message: "正在保存，请稍后以原请求重试" }, { status: 503, headers: { "Retry-After": "2" } });
    console.error("learning_request_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "request_failed", message: "处理暂未完成，请稍后重试" }, { status: 500 });
  }
}

export function assertFound<T>(value: T | null | undefined, message = "记录不存在"): T {
  if (value == null) throw new LearningError("not_found", message, 404);
  return value;
}

export function assertVersion(actual: number, expected: number) {
  if (actual !== expected) throw new LearningError("version_conflict", "内容已更新，请刷新后重试");
}
