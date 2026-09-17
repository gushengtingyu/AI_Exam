import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertFound, assertVersion, LearningError } from "./http";
import { idempotent } from "./idempotency";
import { planInput, regenerateInput } from "./schemas";

const planInclude = { learner: true, tasks: { orderBy: { order: "asc" as const }, include: { sessions: { orderBy: { createdAt: "desc" as const }, take: 1, select: { id: true, status: true } } } } };
type Plan = Prisma.LearningPlanGetPayload<{ include: typeof planInclude }>;

function view(plan: Plan) {
  return {
    id: plan.id, learner_id: plan.learnerId, learner_name: plan.learner.nickname, source_analysis_id: plan.sourceAnalysisId,
    cycle_days: plan.cycleDays, status: plan.status, version: plan.version, revision: plan.revision,
    evidence_limited: plan.evidenceLimited, generated_at: plan.generatedAt,
    tasks: plan.tasks.map(task => ({ id: task.id, title: task.title, subject: task.subject, knowledge_point: task.knowledgePoint, target_level: task.targetLevel, target_count: task.targetCount, success_criteria: task.successCriteria, completed_count: task.completedCount, status: task.status, due_date: task.dueDate, order: task.order, version: task.version, session_id: task.sessions[0]?.id ?? null })),
  };
}

export async function getPlan(id: string) {
  return view(assertFound(await db.learningPlan.findUnique({ where: { id }, include: planInclude })));
}

export async function listPlans(learnerId?: string) {
  return { plans: (await db.learningPlan.findMany({ where: { ...(learnerId ? { learnerId } : {}), learner: { status: "active" } }, orderBy: { createdAt: "desc" }, take: 50, include: planInclude })).map(view) };
}

function knowledgePoints(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map(item => item.trim().slice(0, 100)) : [];
}

export async function createPlan(analysisId: string, key: string, raw: unknown, previousId?: string) {
  const parsed = previousId ? regenerateInput.parse(raw) : planInput.parse(raw);
  const id = await idempotent(key, previousId ? `regenerate:${previousId}` : `plan:${analysisId}`, parsed, async transaction => {
    const analysis = assertFound(await transaction.analysis.findUnique({ where: { id: analysisId }, include: { report: true, papers: { include: { questions: true } } } }));
    if (analysis.status !== "completed" || analysis.report?.status !== "ready") throw new LearningError("validation_error", "请先完成分析并生成报告", 400);
    const learnerId = parsed.learner_id ?? analysis.learnerId;
    if (!learnerId) throw new LearningError("validation_error", "请选择学生档案后生成计划", 400);
    const learner = assertFound(await transaction.learner.findUnique({ where: { id: learnerId } }), "学生档案不存在");
    if (learner.status !== "active") throw new LearningError("validation_error", "学生档案不可用", 400);
    const multiple = analysis.mode === "MULTIPLE_STUDENTS_SINGLE_PAPER";
    if (!multiple && analysis.learnerId && analysis.learnerId !== learnerId) throw new LearningError("validation_error", "该分析已关联其他学生", 400);
    const papers = multiple ? analysis.papers.filter(paper => paper.learnerId === learnerId) : analysis.papers;
    if (!papers.length) throw new LearningError("validation_error", "请先将该学生的试卷关联到档案", 400);
    const questions = papers.flatMap(paper => paper.questions);
    const reliable = questions.filter(question => !question.needsReview && question.status !== "unknown" && question.scoringBasis !== "unavailable" && (question.scoringBasis === "teacher_mark" || question.scoringBasis === "answer_key" || question.confidence >= 0.8) && Array.isArray(question.evidence) && question.evidence.length > 0);
    const weak = reliable.filter(question => ["wrong", "partial", "blank"].includes(question.status));
    const directions = new Map<string, typeof questions[number]>();
    for (const question of weak) for (const point of knowledgePoints(question.knowledgePoints)) if (directions.size < 3 && !directions.has(point)) directions.set(point, question);
    const evidenceLimited = directions.size === 0;
    if (evidenceLimited) for (const question of questions) for (const point of knowledgePoints(question.knowledgePoints)) if (directions.size < 1) directions.set(point, question);
    const entries = [...directions.entries()];
    const activeKey = `${analysisId}:${learnerId}`;
    let revision = 1;
    if (previousId) {
      const previous = assertFound(await transaction.learningPlan.findUnique({ where: { id: previousId } }));
      assertVersion(previous.version, (parsed as z.infer<typeof regenerateInput>).version);
      if (previous.learnerId !== learnerId || previous.sourceAnalysisId !== analysisId || previous.status === "superseded") throw new LearningError("version_conflict", "计划已被替代，请刷新");
      const pending = await transaction.practiceAttempt.count({ where: { session: { task: { planId: previousId } }, gradingStatus: { in: ["submitted", "grading", "failed"] } } });
      if (pending) throw new LearningError("version_conflict", "请先处理尚未完成的批改");
      await transaction.practiceSession.updateMany({ where: { task: { planId: previousId }, status: { in: ["active", "blocked"] } }, data: { status: "abandoned", activeTaskId: null, generationToken: null, version: { increment: 1 } } });
      await transaction.learningPlan.update({ where: { id: previousId, version: previous.version }, data: { status: "superseded", activeKey: null, version: { increment: 1 } } });
      revision = previous.revision + 1;
    } else {
      const existing = await transaction.learningPlan.findUnique({ where: { activeKey } });
      if (existing) {
        if (existing.cycleDays !== parsed.cycle_days || existing.dailyTaskLimit !== parsed.daily_task_limit || existing.questionCount !== parsed.question_count_per_task) throw new LearningError("version_conflict", "已有学习计划，请使用重新生成创建新版本");
        return existing.id;
      }
    }
    if (!multiple && !analysis.learnerId) await transaction.analysis.update({ where: { id: analysisId }, data: { learnerId, version: { increment: 1 } } });
    for (const point of directions.keys()) {
      const evidence = reliable.filter(question => knowledgePoints(question.knowledgePoints).includes(point));
      if (!evidence.length) continue;
      const score = Math.round(evidence.reduce((total, question) => total + (question.status === "correct" ? 100 : question.status === "partial" ? 50 : 0), 0) / evidence.length);
      const where = { learnerId_subject_knowledgePoint: { learnerId, subject: analysis.subject, knowledgePoint: point } };
      if (!await transaction.knowledgeMastery.findUnique({ where })) await transaction.knowledgeMastery.create({ data: { learnerId, subject: analysis.subject, knowledgePoint: point, score, evidenceCount: evidence.length, snapshots: { create: { sourceType: "analysis", sourceId: analysisId, previousScore: score, newScore: score, reason: "来自已确认、有可追溯证据的分析题目" } } } });
    }
    const start = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }) + "T00:00:00Z");
    const tasks = Array.from({ length: parsed.cycle_days }, (_, day) => Array.from({ length: Math.min(parsed.daily_task_limit, Math.max(1, entries.length)) }, (_, slot) => {
      const entry = entries[(day + slot) % Math.max(1, entries.length)];
      const due = new Date(start); due.setUTCDate(due.getUTCDate() + day);
      return { sourceQuestionId: entry?.[1].id, knowledgePoint: entry?.[0] ?? "试卷复核", subject: analysis.subject, grade: analysis.grade, title: entry ? `${evidenceLimited ? "基础巩固" : "专项练习"} · ${entry[0]}` : "确认题目与评分依据", targetLevel: evidenceLimited ? 1 : 3, targetCount: parsed.question_count_per_task, successCriteria: entry ? `至少完成 ${parsed.question_count_per_task} 题，并在${evidenceLimited ? "基础" : "迁移"}层级连续答对 2 题；最多 8 次有效作答` : "完成来源试卷的人工复核后重新生成计划", status: entry ? "pending" : "needs_review", dueDate: due.toISOString().slice(0, 10), order: day * parsed.daily_task_limit + slot };
    })).flat();
    const plan = await transaction.learningPlan.create({ data: { learnerId, sourceAnalysisId: analysisId, activeKey, cycleDays: parsed.cycle_days, dailyTaskLimit: parsed.daily_task_limit, questionCount: parsed.question_count_per_task, revision, evidenceLimited, tasks: { create: tasks } } });
    await transaction.aiRun.create({ data: { analysisId, contextType: "learning_plan", contextId: plan.id, node: "learning_plan", status: "completed", attempt: 1, durationMs: 0, inputJson: { learner_id: learnerId, question_ids: reliable.map(question => question.id) }, outputJson: { source: "deterministic_template_v1", task_count: tasks.length, evidence_limited: evidenceLimited } } });
    return plan.id;
  });
  return getPlan(id);
}

export async function updateTask(id: string, raw: unknown) {
  const input = z.object({ version: z.number().int().positive(), status: z.enum(["skipped", "pending"]) }).strict().parse(raw);
  await db.$transaction(async transaction => {
    const task = assertFound(await transaction.learningTask.findUnique({ where: { id }, include: { plan: true } }));
    assertVersion(task.version, input.version);
    if (task.plan.status !== "active" || (input.status === "pending" ? task.status !== "skipped" : !["pending", "active"].includes(task.status))) throw new LearningError("version_conflict", "任务当前状态不允许此操作");
    if (await transaction.practiceSession.count({ where: { taskId: id, activeTaskId: id } })) throw new LearningError("version_conflict", "请先结束当前练习");
    await transaction.learningTask.update({ where: { id, version: input.version }, data: { status: input.status, version: { increment: 1 } } });
  });
  return { id, status: input.status, version: input.version + 1 };
}
