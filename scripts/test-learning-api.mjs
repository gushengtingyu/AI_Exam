import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const base = process.env.LEARNING_TEST_URL || "http://127.0.0.1:3219";
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base)) throw new Error("This fixture test is restricted to a local test server");
if (!process.env.DATABASE_URL?.includes("learning-integration")) throw new Error("Use an isolated learning-integration database");
const db = new PrismaClient();
const prefix = randomUUID();
async function request(path, body, key, expected = 200) {
  const response = await fetch(`${base}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(result)}`);
  return result;
}
async function ready(id) {
  for (let count = 0; count < 40; count++) {
    const session = await request(`/api/practice-sessions/${id}`);
    if (session.status !== "active" || session.next_question) return session;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("Timed out preparing question");
}
try {
  const learner = await request("/api/learners", { nickname: "集成验收学生", grade: "七年级" }, `${prefix}-learner`, 201);
  const replay = await request("/api/learners", { nickname: "集成验收学生", grade: "七年级" }, `${prefix}-learner`, 201);
  assert.equal(replay.id, learner.id);
  await request("/api/learners", { nickname: "不同学生", grade: "七年级" }, `${prefix}-learner`, 409);
  const analysis = await db.analysis.create({ data: { studentNickname: "集成验收学生", grade: "七年级", subject: "数学", semester: "2026秋", status: "completed", papers: { create: { name: "隔离测试", questions: { create: { questionId: "one", questionNo: "1", questionText: "计算 7 × 8 的结果。", studentAnswer: "54", status: "wrong", knowledgePoints: ["乘法"], errorTags: ["计算"], evidence: [{ image_id: "fixture", bbox: { x: 0, y: 0, width: 1, height: 1 } }], confidence: 0.95, scoringBasis: "teacher_mark" } } } }, report: { create: { schemaVersion: "1", templateVersion: "1", statistics: {}, reportSpec: {} } } } });
  const plan = await request(`/api/analyses/${analysis.id}/learning-plans`, { learner_id: learner.id }, `${prefix}-plan`, 201);
  assert.equal(plan.tasks.length, 7);
  assert.equal(plan.evidence_limited, false);
  const planReplay = await request(`/api/analyses/${analysis.id}/learning-plans`, { learner_id: learner.id }, `${prefix}-plan`, 201);
  assert.equal(planReplay.id, plan.id);
  const created = await request(`/api/learning-tasks/${plan.tasks[0].id}/sessions`, {}, `${prefix}-session`, 201);
  let session = await ready(created.id);
  const original = session;
  assert.equal(session.level, 1);
  assert.equal("reference_answer" in session.next_question, false);
  assert.equal("explanation" in session.next_question, false);
  const firstQuestion = await db.practiceQuestion.findUniqueOrThrow({ where: { id: session.next_question.id } });
  await db.practiceQuestion.update({ where: { id: firstQuestion.id }, data: { type: "single_choice", options: [{ key: "A", text: "选项一" }, { key: "B", text: "选项二" }] } });
  await request(`/api/practice-sessions/${session.id}/attempts`, { client_attempt_id: randomUUID(), question_id: firstQuestion.id, answer: "not-an-option", session_version: session.version }, undefined, 400);
  assert.equal(await db.practiceAttempt.count({ where: { sessionId: session.id } }), 0);
  assert.equal((await request(`/api/practice-sessions/${session.id}`)).next_question.id, firstQuestion.id);
  await db.practiceQuestion.update({ where: { id: firstQuestion.id }, data: { type: firstQuestion.type, options: firstQuestion.options } });
  for (let count = 0; count < 6; count++) {
    assert.equal(session.next_question.level, session.level);
    assert.equal(session.attempts.some(attempt => attempt.question_id === session.next_question.id), false);
    const question = await db.practiceQuestion.findUniqueOrThrow({ where: { id: session.next_question.id } });
    const payload = { client_attempt_id: randomUUID(), question_id: question.id, answer: question.referenceAnswer, session_version: session.version };
    const response = await request(`/api/practice-sessions/${session.id}/attempts`, payload);
    const [repeated] = await Promise.all([request(`/api/practice-sessions/${session.id}/attempts`, payload), request(`/api/practice-sessions/${session.id}`), request(`/api/practice-sessions/${session.id}`)]);
    assert.equal(repeated.attempt_id, response.attempt_id);
    assert.equal(response.result, "correct");
    assert.ok(response.session.attempts.at(-1).reference_answer);
    await request(`/api/practice-sessions/${session.id}/attempts`, { ...payload, answer: "different" }, undefined, 409);
    if (count === 0) await request(`/api/practice-sessions/${session.id}/attempts`, { ...payload, client_attempt_id: randomUUID(), session_version: original.version }, undefined, 409);
    session = await ready(session.id);
  }
  assert.equal(session.status, "completed");
  assert.equal(session.effective_attempts, 6);
  const task = await db.learningTask.findUniqueOrThrow({ where: { id: plan.tasks[0].id } });
  assert.equal(task.completedCount, 6);
  assert.equal(task.status, "completed");
  const mastery = await db.knowledgeMastery.findFirstOrThrow({ where: { learnerId: learner.id } });
  assert.equal(mastery.score, 36);
  assert.equal(mastery.evidenceCount, 7);
  assert.equal(await db.masterySnapshot.count({ where: { masteryId: mastery.id, sourceType: "practice_attempt" } }), 6);
  assert.equal(await db.practiceAttempt.count({ where: { sessionId: session.id } }), 6);

  const next = await request(`/api/learning-tasks/${plan.tasks[1].id}/sessions`, {}, `${prefix}-subjective`, 201);
  const subjective = await ready(next.id);
  await db.practiceQuestion.update({ where: { id: subjective.next_question.id }, data: { type: "subjective" } });
  await request(`/api/practice-sessions/${next.id}/attempts`, { client_attempt_id: randomUUID(), question_id: subjective.next_question.id, answer: "请帮我检查过程", session_version: subjective.version });
  const reviewed = await ready(next.id);
  assert.equal(reviewed.status, "blocked");
  assert.equal(reviewed.effective_attempts, 0);
  assert.equal(reviewed.attempts[0].grading_status, "needs_review");
  assert.equal((await db.knowledgeMastery.findUniqueOrThrow({ where: { id: mastery.id } })).score, 36);
  await db.practiceQuestion.update({ where: { id: subjective.next_question.id }, data: { type: "numeric" } });

  const cappedTask = plan.tasks[2];
  let capped = await ready((await request(`/api/learning-tasks/${cappedTask.id}/sessions`, {}, `${prefix}-cap-first`, 201)).id);
  for (let index = 0; index < 2; index++) {
    await request(`/api/practice-sessions/${capped.id}/attempts`, { client_attempt_id: randomUUID(), question_id: capped.next_question.id, answer: "-999999", session_version: capped.version });
    capped = await ready(capped.id);
  }
  assert.equal(capped.status, "blocked");
  await request(`/api/practice-sessions/${capped.id}/complete`, { version: capped.version });
  capped = await ready((await request(`/api/learning-tasks/${cappedTask.id}/sessions`, {}, `${prefix}-cap-resume`, 201)).id);
  assert.equal(capped.effective_attempts, 2);
  for (let index = 0; index < 6; index++) {
    const question = await db.practiceQuestion.findUniqueOrThrow({ where: { id: capped.next_question.id } });
    await request(`/api/practice-sessions/${capped.id}/attempts`, { client_attempt_id: randomUUID(), question_id: question.id, answer: index % 2 === 0 ? question.referenceAnswer : "-999999", session_version: capped.version });
    capped = await ready(capped.id);
  }
  assert.equal(capped.effective_attempts, 8);
  assert.equal(capped.status, "blocked");
  await request(`/api/practice-sessions/${capped.id}/complete`, { version: capped.version });
  await request(`/api/learning-tasks/${cappedTask.id}/sessions`, {}, `${prefix}-cap-denied`, 409);

  const changed = await request(`/api/learning-plans/${plan.id}/regenerate`, { version: plan.version, cycle_days: 14 }, `${prefix}-regenerate`, 201);
  assert.equal(changed.revision, 2);
  assert.equal(changed.tasks.length, 14);
  await db.learner.update({ where: { id: learner.id }, data: { status: "archived" } });
  assert.equal((await request("/api/learners")).learners.some(row => row.id === learner.id), false);
  assert.equal((await request(`/api/learning-plans?learner_id=${learner.id}`)).plans.length, 0);
  assert.equal((await request(`/api/practice-sessions/${session.id}`)).attempts.length, 6);
  assert.equal((await request(`/api/learning-plans/${plan.id}`)).status, "superseded");
  assert.equal(await db.practiceAttempt.count({ where: { sessionId: session.id } }), 6);
  console.log(JSON.stringify({ passed: true, learner_id: learner.id, analysis_id: analysis.id, plan_id: plan.id, new_plan_id: changed.id, session_id: session.id, mastery: mastery.score, checks: ["idempotency", "version_conflict", "answer_redaction", "three_levels", "transaction_consistency", "needs_review", "regeneration_preserves_history"] }));
} finally { await db.$disconnect(); }
