import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const directory = process.argv[2];
const answer = process.argv[3];
const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
if (!/^output\/learning-smoke-\d+$/.test(directory || "") || !answer || !base.startsWith("https://")) throw new Error("Provide smoke output directory, independently solved answer and HTTPS APP_BASE_URL");
const ids = JSON.parse(await readFile(`${directory}/ids.json`, "utf8"));
const session = JSON.parse(await readFile(`${directory}/session.json`, "utf8"));
const attempt = { client_attempt_id: randomUUID(), question_id: session.next_question.id, answer, session_version: session.version };
await writeFile(`${directory}/attempt-${attempt.client_attempt_id}.json`, JSON.stringify(attempt, null, 2));
const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(attempt) };
const response = await fetch(`${base}/api/practice-sessions/${ids.session_id}/attempts`, init);
const result = await response.json();
assert(response.ok, JSON.stringify(result));
const replay = await fetch(`${base}/api/practice-sessions/${ids.session_id}/attempts`, init);
const replayed = await replay.json();
assert(replay.ok, JSON.stringify(replayed));
assert.equal(replayed.attempt_id, result.attempt_id);
console.log(JSON.stringify({ attempt_id: result.attempt_id, grading_status: result.grading_status, result: result.result, mastery: result.mastery, idempotency_verified: true }));
for (let count = 0; count < 90; count++) {
  const latest = await (await fetch(`${base}/api/practice-sessions/${ids.session_id}`)).json();
  if (latest.next_question || latest.status !== "active") {
    await writeFile(`${directory}/session.json`, JSON.stringify(latest, null, 2));
    console.log(JSON.stringify({ status: latest.status, effective_attempts: latest.effective_attempts, session_version: latest.version, latest_result: latest.attempts.at(-1), next_question: latest.next_question }));
    break;
  }
  if (latest.question_status === "retryable") throw new Error("Generation requires inspection");
  if (count === 89) throw new Error("Timed out");
  await new Promise(resolve => setTimeout(resolve, 3000));
}
