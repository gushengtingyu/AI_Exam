import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function apiError(error: unknown, fallback = "请求处理失败") {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "validation_error", message: error.issues.map((issue) => issue.message).join("；"), issues: error.issues },
      { status: 400 },
    );
  }
  const message = process.env.NODE_ENV === "production"
    ? fallback
    : error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: "request_failed", message }, { status: 500 });
}

export function notFound(message = "记录不存在") {
  return NextResponse.json({ error: "not_found", message }, { status: 404 });
}
