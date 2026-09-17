import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { LearningError } from "./http";

export function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function idempotent(key: string, scope: string, input: unknown, create: (transaction: Prisma.TransactionClient) => Promise<string>) {
  const hash = fingerprint(input);
  const existing = await db.learningRequest.findUnique({ where: { key } });
  if (existing) {
    if (existing.scope !== scope || existing.fingerprint !== hash) throw new LearningError("idempotency_conflict", "该请求编号已用于不同内容");
    return existing.resourceId;
  }
  try {
    return await db.$transaction(async transaction => {
      const resourceId = await create(transaction);
      await transaction.learningRequest.create({ data: { key, scope, fingerprint: hash, resourceId } });
      return resourceId;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replay = await db.learningRequest.findUnique({ where: { key } });
      if (replay) {
        if (replay.scope !== scope || replay.fingerprint !== hash) throw new LearningError("idempotency_conflict", "该请求编号已用于不同内容");
        return replay.resourceId;
      }
    }
    throw error;
  }
}
