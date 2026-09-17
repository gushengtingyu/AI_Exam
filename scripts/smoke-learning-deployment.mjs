import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
const analysisId = process.env.LEARNING_SMOKE_ANALYSIS_ID;
if (!base.startsWith("https://") || !analysisId) throw new Error("Set HTTPS APP_BASE_URL and an explicitly designated synthetic LEARNING_SMOKE_ANALYSIS_ID");
const run = `learning-smoke-${Date.now()}`;
const directory = `output/${run}`;
await mkdir(directory, { recursive: true });
async function request(path, body, key) {
  const response = await fetch(`${base}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const payload = await response.json();
  assert(response.ok, `${path}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}
const health = await request("/api/health");
assert.equal(health.mock_mode, false);
assert.equal(health.api_contract_version, "3.0.0");
const learner = await request("/api/learners", { nickname: "第一期公网验收（合成试卷）", grade: "七年级" }, `${run}-learner`);
const plan = await request(`/api/analyses/${analysisId}/learning-plans`, { learner_id: learner.id }, `${run}-plan`);
assert(plan.tasks.length >= 2);
const started = await request(`/api/learning-tasks/${plan.tasks[0].id}/sessions`, {}, `${run}-session`);
const ids = { run, analysis_id: analysisId, learner_id: learner.id, plan_id: plan.id, session_id: started.id, directory };
await writeFile(`${directory}/ids.json`, JSON.stringify(ids, null, 2));
console.log(JSON.stringify(ids));
let previous = "";
for (let count = 0; count < 90; count++) {
  const session = await request(`/api/practice-sessions/${started.id}`);
  if (session.next_question) {
    assert.equal("reference_answer" in session.next_question, false);
    assert.equal("explanation" in session.next_question, false);
    await writeFile(`${directory}/session.json`, JSON.stringify(session, null, 2));
    console.log(JSON.stringify({ ready: true, question: session.next_question, session_version: session.version, client_attempt_id: randomUUID() }));
    break;
  }
  if (session.question_status !== previous) { previous = session.question_status; console.log(JSON.stringify({ question_status: previous, message: session.message })); }
  if (session.question_status === "retryable") throw new Error("Real question generation requires inspection; no repeated automated generation");
  if (count === 89) throw new Error("Timed out waiting for question");
  await new Promise(resolve => setTimeout(resolve, 4000));
}
