import { db } from "@/lib/db";
import type { Learner } from "@prisma/client";
import { learnerInput, learnerPatch } from "./schemas";
import { assertFound, assertVersion } from "./http";
import { idempotent } from "./idempotency";

export function learnerView(learner: Learner) {
  return { id: learner.id, nickname: learner.nickname, grade: learner.grade, curriculum_version: learner.curriculumVersion, notes: learner.notes, status: learner.status, version: learner.version, updated_at: learner.updatedAt };
}

export async function listLearners() {
  return { learners: (await db.learner.findMany({ where: { status: "active" }, orderBy: { updatedAt: "desc" }, take: 200 })).map(learnerView) };
}

export async function getLearner(id: string) {
  return learnerView(assertFound(await db.learner.findUnique({ where: { id } })));
}

export async function createLearner(key: string, raw: unknown) {
  const input = learnerInput.parse(raw);
  const id = await idempotent(key, "learner", input, async transaction => (await transaction.learner.create({ data: { nickname: input.nickname, grade: input.grade, curriculumVersion: input.curriculum_version, notes: input.notes } })).id);
  return getLearner(id);
}

export async function updateLearner(id: string, raw: unknown) {
  const input = learnerPatch.parse(raw);
  return db.$transaction(async transaction => {
    const learner = assertFound(await transaction.learner.findUnique({ where: { id } }));
    assertVersion(learner.version, input.version);
    return learnerView(await transaction.learner.update({ where: { id, version: input.version }, data: { nickname: input.nickname, grade: input.grade, curriculumVersion: input.curriculum_version, notes: input.notes, version: { increment: 1 } } }));
  });
}

export async function getMastery(id: string) {
  await getLearner(id);
  const rows = await db.knowledgeMastery.findMany({ where: { learnerId: id }, orderBy: { updatedAt: "desc" }, take: 200, include: { snapshots: { orderBy: { createdAt: "desc" }, take: 5 } } });
  return { mastery: rows.map(row => ({ id: row.id, subject: row.subject, knowledge_point: row.knowledgePoint, score: row.score, evidence_count: row.evidenceCount, version: row.version, updated_at: row.updatedAt, changes: row.snapshots.map(snapshot => ({ before: snapshot.previousScore, after: snapshot.newScore, reason: snapshot.reason, source_type: snapshot.sourceType, source_id: snapshot.sourceId, created_at: snapshot.createdAt })) })) };
}

export async function getHistory(id: string) {
  await getLearner(id);
  const [analyses, plans, sessions] = await Promise.all([
    db.analysis.findMany({ where: { OR: [{ learnerId: id }, { papers: { some: { learnerId: id } } }] }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, subject: true, status: true, createdAt: true } }),
    db.learningPlan.findMany({ where: { learnerId: id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, status: true, revision: true, createdAt: true } }),
    db.practiceSession.findMany({ where: { learnerId: id }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, taskId: true, status: true, effectiveAttempts: true, updatedAt: true } }),
  ]);
  return { analyses: analyses.map(row => ({ id: row.id, subject: row.subject, status: row.status, created_at: row.createdAt })), plans: plans.map(row => ({ id: row.id, status: row.status, revision: row.revision, created_at: row.createdAt })), sessions: sessions.map(row => ({ id: row.id, task_id: row.taskId, status: row.status, effective_attempts: row.effectiveAttempts, updated_at: row.updatedAt })) };
}
