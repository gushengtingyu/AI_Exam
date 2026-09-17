import { Prisma } from "@prisma/client";
import type { ZodType } from "zod";
import { db } from "@/lib/db";
import { getAiProvider } from "@/lib/ai/provider";
import { ProviderRequestError, providerRetryDelay } from "@/lib/ai/provider-errors";
import { LearningError } from "./http";

const runtime = globalThis as unknown as { learningAiBusy?: boolean };

export function modelVersion() {
  if (process.env.MOCK_MODE !== "false") return "mock-learning-v1";
  const provider = (process.env.TEXT_PROVIDER ?? "").replace(/[^a-z0-9]+/gi, "_").toUpperCase();
  return process.env[`${provider}_TEXT_MODEL`] || process.env[`${provider}_MODEL`] || process.env.TEXT_MODEL || "configured-text-model";
}

export async function learningAi<T>(node: "practice_generation" | "practice_grading", contextId: string, input: unknown, schema: ZodType<T>): Promise<T> {
  if (runtime.learningAiBusy) throw new LearningError("server_busy", "练习服务正在处理其他任务", 503);
  runtime.learningAiBusy = true;
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const started = Date.now();
      const audit = await db.aiRun.create({ data: { node, contextType: node === "practice_grading" ? "practice_attempt" : "practice_session", contextId, status: "running", attempt, inputJson: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue } });
      try {
        const raw = await getAiProvider().runNode(node, input, schema);
        await db.aiRun.update({ where: { id: audit.id }, data: { outputJson: JSON.parse(JSON.stringify(raw ?? null)) ?? Prisma.JsonNull } });
        const output = schema.parse(raw);
        await db.aiRun.update({ where: { id: audit.id }, data: { status: "completed", durationMs: Date.now() - started, outputJson: JSON.parse(JSON.stringify(output)) as Prisma.InputJsonValue } });
        return output;
      } catch (error) {
        await db.aiRun.update({ where: { id: audit.id }, data: { status: "failed", durationMs: Date.now() - started, error: error instanceof ProviderRequestError ? error.message : "输出校验失败或上游不可用" } });
        const delay = error instanceof ProviderRequestError ? providerRetryDelay(error, attempt) : null;
        if (attempt === 2 || delay === null) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error("练习 AI 未返回结果");
  } finally {
    runtime.learningAiBusy = false;
  }
}
