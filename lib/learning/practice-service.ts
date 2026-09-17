import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { advance, initialLevel, masteryDelta, numericAnswer, objectiveGrade, POLICY } from "./adaptive-policy";
import { assertFound, assertVersion, LearningError } from "./http";
import { idempotent, fingerprint } from "./idempotency";
import { attemptInput, gradingOutput, questionBatch, versionInput } from "./schemas";
import { learningAi, modelVersion } from "./ai-service";

const sessionInclude = { task: { include: { plan: true } }, attempts: { orderBy: { submittedAt: "asc" as const }, include: { question: true } } };
const staleBefore = () => new Date(Date.now() - 10 * 60_000);
const pendingStatuses = ["submitted", "grading", "failed"];

export function scheduleSession(id: string) {
  after(async () => {
    try { await recoverSession(id); } catch (error) { console.error("learning_recovery_failed", error instanceof Error ? error.name : "unknown"); }
  });
}

export async function getSession(id: string) {
  const session = assertFound(await db.practiceSession.findUnique({ where: { id }, include: sessionInclude }));
  const question = session.nextQuestionId && session.status === "active" ? await db.practiceQuestion.findUnique({ where: { id: session.nextQuestionId } }) : null;
  return {
    id: session.id, learner_id: session.learnerId, task_id: session.taskId, task_title: session.task.title, plan_id: session.task.planId,
    status: session.status, level: session.currentLevel, version: session.version, effective_attempts: session.effectiveAttempts,
    target_count: session.task.targetCount, max_attempts: POLICY.maxAttempts, question_status: session.questionStatus, message: session.lastError,
    next_question: question ? { id: question.id, content: question.content, type: question.type, options: question.options, level: question.level, knowledge_point: question.knowledgePoint, version: question.version } : null,
    attempts: session.attempts.map(attempt => ({
      id: attempt.id, client_attempt_id: attempt.clientAttemptId, question_id: attempt.questionId, question_content: attempt.question.content,
      answer: attempt.answer, grading_status: attempt.gradingStatus, result: attempt.result, confidence: attempt.confidence, feedback: attempt.feedback,
      version: attempt.version, submitted_at: attempt.submittedAt,
      mastery: attempt.masteryBefore === null ? null : { before: attempt.masteryBefore, after: attempt.masteryAfter },
      reference_answer: attempt.gradingStatus === "graded" ? attempt.question.referenceAnswer : null,
      explanation: attempt.gradingStatus === "graded" ? attempt.question.explanation : null,
      hint: attempt.gradingStatus === "graded" && attempt.result === "wrong" ? attempt.question.hint : null,
    })),
  };
}

export async function createSession(taskId: string, key: string) {
  const id = await idempotent(key, `session:${taskId}`, {}, async transaction => {
    const task = assertFound(await transaction.learningTask.findUnique({ where: { id: taskId }, include: { plan: true } }));
    if (task.plan.status !== "active" || ["completed", "skipped"].includes(task.status)) throw new LearningError("version_conflict", "任务已结束或计划已更新");
    const existing = await transaction.practiceSession.findUnique({ where: { activeTaskId: taskId } });
    if (existing) return existing.id;
    if (task.completedCount >= POLICY.maxAttempts) throw new LearningError("version_conflict", "本任务已达到八次有效作答上限，请复习后进入下一日任务或重新生成计划");
    if (!task.sourceQuestionId) throw new LearningError("validation_error", "请先完成试卷复核并重新生成学习计划", 400);
    const mastery = await transaction.knowledgeMastery.findUnique({ where: { learnerId_subject_knowledgePoint: { learnerId: task.plan.learnerId, subject: task.subject, knowledgePoint: task.knowledgePoint } } });
    const session = await transaction.practiceSession.create({ data: { taskId, activeTaskId: taskId, learnerId: task.plan.learnerId, effectiveAttempts: task.completedCount, currentLevel: Math.min(task.targetLevel, initialLevel(mastery?.score)) } });
    await transaction.learningTask.update({ where: { id: taskId }, data: { status: "active", version: { increment: 1 } } });
    return session.id;
  });
  scheduleSession(id);
  return getSession(id);
}

export async function ensureQuestion(id: string) {
  const session = await db.practiceSession.findUnique({ where: { id }, include: sessionInclude });
  if (!session || session.status !== "active" || session.nextQuestionId || session.attempts.some(attempt => pendingStatuses.includes(attempt.gradingStatus))) return;
  if (session.questionStatus === "retryable" && session.generationStartedAt && Date.now() - session.generationStartedAt.getTime() < 60_000) return;
  const token = randomUUID();
  const claimed = await db.practiceSession.updateMany({ where: { id, version: session.version, currentLevel: session.currentLevel, status: "active", nextQuestionId: null, OR: [{ generationToken: null }, { generationStartedAt: { lt: staleBefore() } }] }, data: { generationToken: token, generationStartedAt: new Date(), questionStatus: "generating" } });
  if (!claimed.count) return;
  try {
    const used = session.attempts.map(attempt => attempt.questionId);
    let question = await db.practiceQuestion.findFirst({ where: { sourceQuestionId: session.task.sourceQuestionId, knowledgePoint: session.task.knowledgePoint, level: session.currentLevel, status: "active", id: { notIn: used } }, orderBy: { createdAt: "asc" } });
    if (!question) {
      const source = assertFound(await db.question.findUnique({ where: { id: session.task.sourceQuestionId! } }));
      const [analysis, learner] = await Promise.all([db.analysis.findUnique({ where: { id: session.task.plan.sourceAnalysisId } }), db.learner.findUnique({ where: { id: session.learnerId } })]);
      const output = await learningAi("practice_generation", id, { source_question: source.questionText, subject: session.task.subject, grade: session.task.grade, semester: analysis?.semester, curriculum_version: learner?.curriculumVersion, knowledge_point: session.task.knowledgePoint, level: session.currentLevel, sequence: session.attempts.length, excluded_questions: session.attempts.map(attempt => attempt.question.content), count: 3 }, questionBatch);
      for (const generated of output.questions) {
        if (generated.level !== session.currentLevel || generated.knowledge_point !== session.task.knowledgePoint || generated.content.replace(/\s/g, "") === source.questionText.replace(/\s/g, "")) continue;
        if (generated.type === "numeric" && numericAnswer(generated.reference_answer) === null) continue;
        const contentHash = fingerprint([source.id, generated.knowledge_point, generated.level, generated.content.normalize("NFKC").replace(/\s/g, "")]);
        const saved = await db.practiceQuestion.upsert({ where: { contentHash }, update: {}, create: { sourceQuestionId: source.id, subject: session.task.subject, grade: session.task.grade, knowledgePoint: generated.knowledge_point, level: generated.level, type: generated.type, content: generated.content, options: generated.options, referenceAnswer: generated.reference_answer, explanation: generated.explanation, hint: generated.hint, source: "ai", modelVersion: modelVersion(), contentHash, qualityStatus: "needs_sampling" } });
        if (!used.includes(saved.id) && !question) question = saved;
      }
    }
    if (!question) throw new LearningError("grading_unavailable", "暂未生成可用题目，请稍后重试", 422);
    const selected = question;
    await db.$transaction(async transaction => {
      const current = await transaction.practiceSession.findFirst({ where: { id, version: session.version, generationToken: token, status: "active" } });
      if (!current) return;
      const relation = await transaction.learningTaskQuestion.findUnique({ where: { taskId_questionId: { taskId: session.taskId, questionId: selected.id } } });
      if (!relation) {
        const order = await transaction.learningTaskQuestion.count({ where: { taskId: session.taskId } });
        await transaction.learningTaskQuestion.create({ data: { taskId: session.taskId, questionId: selected.id, order } });
      }
      await transaction.practiceSession.update({ where: { id, generationToken: token }, data: { nextQuestionId: selected.id, questionStatus: "ready", generationToken: null, lastError: null, version: { increment: 1 } } });
    });
  } catch {
    await db.practiceSession.updateMany({ where: { id, generationToken: token }, data: { generationToken: null, questionStatus: "retryable", lastError: "出题服务暂不可用，已保留练习进度，请稍后重试。" } });
  }
}

export async function submitAttempt(sessionId: string, raw: unknown) {
  const input = attemptInput.parse(raw);
  const save = async () => db.$transaction(async transaction => {
    const existing = await transaction.practiceAttempt.findUnique({ where: { clientAttemptId: input.client_attempt_id } });
    if (existing) {
      if (existing.sessionId !== sessionId || existing.questionId !== input.question_id || existing.answer !== input.answer) throw new LearningError("idempotency_conflict", "作答编号已用于其他答案");
      return existing.id;
    }
    const session = assertFound(await transaction.practiceSession.findUnique({ where: { id: sessionId }, include: { task: { include: { plan: true } } } }));
    assertVersion(session.version, input.session_version);
    if (session.status !== "active" || session.task.plan.status !== "active" || session.nextQuestionId !== input.question_id) throw new LearningError("version_conflict", "当前题目已变化，请刷新并保留原答案");
    const question = assertFound(await transaction.practiceQuestion.findUnique({ where: { id: input.question_id } }));
    if (question.type === "single_choice") {
      const options = Array.isArray(question.options) ? question.options : [];
      if (!options.some(option => option && typeof option === "object" && !Array.isArray(option) && option.key === input.answer.trim())) {
        throw new LearningError("validation_error", "请选择一个有效选项", 400);
      }
    }
    const attempt = await transaction.practiceAttempt.create({ data: { sessionId, questionId: input.question_id, clientAttemptId: input.client_attempt_id, answer: input.answer } });
    await transaction.practiceSession.update({ where: { id: sessionId, version: input.session_version }, data: { nextQuestionId: null, questionStatus: "grading", version: { increment: 1 } } });
    return attempt.id;
  });
  let attemptId: string;
  try { attemptId = await save(); } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    attemptId = await save();
  }
  const attempt = assertFound(await db.practiceAttempt.findUnique({ where: { id: attemptId }, include: { question: true } }));
  if (objectiveGrade(attempt.question.type, attempt.answer, attempt.question.referenceAnswer) !== null && attempt.gradingStatus === "submitted") await gradeAttempt(attemptId);
  scheduleSession(sessionId);
  const session = await getSession(sessionId);
  const result = session.attempts.find(item => item.id === attemptId)!;
  return { attempt_id: attemptId, grading_status: result.grading_status, result: result.result, feedback: result.feedback, mastery: result.mastery, session, next_question: session.next_question };
}

export async function gradeAttempt(id: string) {
  const token = randomUUID();
  const claimed = await db.practiceAttempt.updateMany({ where: { id, OR: [{ gradingStatus: "submitted" }, { gradingStatus: "grading", gradingStartedAt: { lt: staleBefore() } }] }, data: { gradingStatus: "grading", gradingToken: token, gradingStartedAt: new Date(), gradingAttempts: { increment: 1 } } });
  if (!claimed.count) return;
  const attempt = assertFound(await db.practiceAttempt.findUnique({ where: { id }, include: { question: true } }));
  try {
    const deterministic = objectiveGrade(attempt.question.type, attempt.answer, attempt.question.referenceAnswer);
    const graded = deterministic === null
      ? await learningAi("practice_grading", id, { question: attempt.question.content, reference_answer: attempt.question.referenceAnswer, explanation: attempt.question.explanation, student_answer: attempt.answer }, gradingOutput).catch(error => {
          if (error instanceof ZodError) return { result: "needs_review" as const, confidence: 0, feedback: "批改输出未通过质量校验，需要人工复核。" };
          throw error;
        })
      : { result: deterministic, confidence: deterministic === "needs_review" ? 0 : 1, feedback: deterministic === "correct" ? "答案正确，继续巩固。" : deterministic === "wrong" ? "这次还差一点，请对照解析检查关键步骤。" : "答案格式或评分依据需要人工确认。" };
    const result = graded.confidence < POLICY.confidenceThreshold ? "needs_review" : graded.result;
    await db.$transaction(async transaction => {
      const current = await transaction.practiceAttempt.findFirst({ where: { id, gradingToken: token, gradingStatus: "grading" } });
      if (!current) return;
      const session = assertFound(await transaction.practiceSession.findUnique({ where: { id: attempt.sessionId }, include: { task: true } }));
      if (session.status !== "active") throw new LearningError("version_conflict", "会话状态已更新");
      let before: number | null = null;
      let afterScore: number | null = null;
      if (result !== "needs_review") {
        const where = { learnerId_subject_knowledgePoint: { learnerId: session.learnerId, subject: session.task.subject, knowledgePoint: session.task.knowledgePoint } };
        const mastery = await transaction.knowledgeMastery.upsert({ where, update: {}, create: { ...where.learnerId_subject_knowledgePoint, score: 50, evidenceCount: 0 } });
        before = mastery.score;
        afterScore = Math.max(0, Math.min(100, before + masteryDelta(attempt.question.level, result)));
        await transaction.knowledgeMastery.update({ where: { id: mastery.id, version: mastery.version }, data: { score: afterScore, evidenceCount: { increment: 1 }, version: { increment: 1 }, snapshots: { create: { sourceType: "practice_attempt", sourceId: id, previousScore: before, newScore: afterScore, reason: `第 ${attempt.question.level} 层级练习：${result}` } } } });
      }
      const next = advance(session, result, session.task.targetCount, session.task.targetLevel);
      await transaction.practiceAttempt.update({ where: { id, gradingToken: token }, data: { status: result === "needs_review" ? "needs_review" : "graded", gradingStatus: result === "needs_review" ? "needs_review" : "graded", result, confidence: graded.confidence, feedback: graded.feedback, masteryBefore: before, masteryAfter: afterScore, gradingToken: null, gradedAt: new Date(), version: { increment: 1 } } });
      await transaction.practiceSession.update({ where: { id: session.id, version: session.version }, data: { currentLevel: next.currentLevel, correctStreak: next.correctStreak, wrongStreak: next.wrongStreak, effectiveAttempts: next.effectiveAttempts, status: next.status, activeTaskId: next.status === "completed" ? null : session.taskId, questionStatus: next.status === "active" ? "generating" : "finished", completedAt: next.status === "completed" ? new Date() : null, version: { increment: 1 } } });
      await transaction.learningTask.update({ where: { id: session.taskId }, data: { completedCount: next.effectiveAttempts, status: next.taskStatus, version: { increment: 1 } } });
      const remaining = await transaction.learningTask.count({ where: { planId: session.task.planId, status: { notIn: ["completed", "skipped"] } } });
      if (!remaining) await transaction.learningPlan.update({ where: { id: session.task.planId }, data: { status: "completed", version: { increment: 1 } } });
    });
  } catch {
    await db.practiceAttempt.updateMany({ where: { id, gradingToken: token }, data: { gradingStatus: "failed", gradingToken: null, feedback: "批改暂未完成，原始答案已保存，可稍后重试。", version: { increment: 1 } } });
  }
}

export async function recoverSession(id: string) {
  const pending = await db.practiceAttempt.findFirst({ where: { sessionId: id, OR: [{ gradingStatus: "submitted" }, { gradingStatus: "grading", gradingStartedAt: { lt: staleBefore() } }] }, orderBy: { submittedAt: "asc" } });
  if (pending) await gradeAttempt(pending.id);
  await ensureQuestion(id);
}

export async function retryGrading(id: string, raw: unknown) {
  const input = versionInput.parse(raw);
  const attempt = await db.$transaction(async transaction => {
    const current = assertFound(await transaction.practiceAttempt.findUnique({ where: { id } }));
    assertVersion(current.version, input.version);
    if (current.gradingStatus !== "failed") throw new LearningError("version_conflict", "只有失败的批改可以重试");
    return transaction.practiceAttempt.update({ where: { id, version: input.version }, data: { gradingStatus: "submitted", version: { increment: 1 } } });
  });
  scheduleSession(attempt.sessionId);
  return { attempt_id: id, grading_status: "submitted", version: attempt.version };
}

export async function completeSession(id: string, raw: unknown) {
  const input = versionInput.parse(raw);
  await db.$transaction(async transaction => {
    const session = assertFound(await transaction.practiceSession.findUnique({ where: { id }, include: { attempts: true } }));
    if (["completed", "abandoned"].includes(session.status)) return;
    assertVersion(session.version, input.version);
    if (session.attempts.some(attempt => pendingStatuses.includes(attempt.gradingStatus))) throw new LearningError("version_conflict", "请先完成待处理批改");
    await transaction.practiceSession.update({ where: { id, version: input.version }, data: { status: "abandoned", activeTaskId: null, nextQuestionId: null, generationToken: null, completedAt: new Date(), version: { increment: 1 } } });
    await transaction.learningTask.update({ where: { id: session.taskId }, data: { status: "needs_review", version: { increment: 1 } } });
  });
  return getSession(id);
}
