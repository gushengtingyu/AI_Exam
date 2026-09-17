import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
if (!base.startsWith("https://")) throw new Error("Set APP_BASE_URL to the public HTTPS application URL");
const key = `deployment-${Date.now()}`;
const out = `output/${key}`;
await mkdir(out, { recursive: true });
const image = await sharp(Buffer.from(`<svg width="1000" height="1400" xmlns="http://www.w3.org/2000/svg">
<rect width="1000" height="1400" fill="white"/>
<g fill="black" font-family="Arial" font-size="32">
<text x="70" y="90">Mathematics Test - Deployment Sample</text>
<text x="70" y="160">Grade 7. Total: 30 points. Page 1 of 1.</text>
<text x="70" y="280">1. Calculate 12 + 8. (10 points)</text>
<text x="70" y="490">2. Solve 3x = 21. (10 points)</text>
<text x="70" y="700">3. Rectangle: length 6 cm, width 4 cm.</text>
<text x="70" y="750">Find its area. (10 points)</text></g>
<g fill="#1547a0" font-family="Arial" font-size="34">
<text x="90" y="350">Student answer: 12 + 8 = 20</text>
<text x="90" y="560">Student answer: x = 21 / 3 = 7</text>
<text x="90" y="830">Student answer: 6 + 4 = 10 cm2</text></g>
<g fill="#cf1d1d" font-family="Arial" font-size="30">
<text x="75" y="400">Correct. Score: 10 / 10</text>
<text x="75" y="610">Correct. Score: 10 / 10</text>
<text x="75" y="890">Wrong. Score: 0 / 10</text>
<text x="75" y="1030">Total score: 20 / 30</text></g></svg>`)).png().toBuffer();
await writeFile(`${out}/sample.png`, image);
async function json(route, init) {
  const response = await fetch(`${base}${route}`, { ...init, signal: AbortSignal.timeout(120_000) });
  const data = await response.json();
  assert(response.ok, `${route}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
const health = await json("/api/health");
assert.equal(health.mock_mode, false);
assert.equal(health.capabilities.idempotency, true);
async function create(suffix) {
  const init = { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": `${key}-${suffix}` }, body: JSON.stringify({
    mode: "SINGLE_STUDENT_SINGLE_PAPER", student_nickname: `部署验收-${suffix}`, grade: "七年级", subject: "数学", semester: "2026 秋季",
    papers: [{ name: "合成试卷（非真实学生）", date: "2026-09-10", max_score: 30 }],
  }) };
  const created = await json("/api/analysis", init);
  const replay = await json("/api/analysis", init);
  assert.equal(replay.analysis_id, created.analysis_id);
  assert.equal(replay.idempotent_replay, true);
  const form = new FormData();
  form.append("paper_id", created.papers[0].paper_id);
  form.append("kind", "paper"); form.append("page_order", "0");
  form.append("files", new Blob([image], { type: "image/png" }), "sample.png");
  const upload = { method: "POST", headers: { "Idempotency-Key": `${key}-${suffix}-image` }, body: form };
  const first = await json(`/api/analysis/${created.analysis_id}/images`, upload);
  const second = await json(`/api/analysis/${created.analysis_id}/images`, upload);
  assert.equal(first.images[0].image_id, second.images[0].image_id);
  assert.equal(second.idempotent_replay, true);
  assert.equal(first.images[0].page_order, 0);
  return created;
}
const primary = await create("real");
const capacity = await create("capacity");
await writeFile(`${out}/ids.json`, JSON.stringify({ primary, capacity }, null, 2));
const started = await json(`/api/analysis/${primary.analysis_id}/start`, { method: "POST" });
const restart = await json(`/api/analysis/${primary.analysis_id}/start`, { method: "POST" });
assert.equal(restart.job_id, started.job_id);
const busy = await fetch(`${base}/api/analysis/${capacity.analysis_id}/start`, { method: "POST" });
assert.equal(busy.status, 503);
assert.equal(busy.headers.get("retry-after"), "30");
console.log(`analysis=${primary.analysis_id}; idempotency and capacity checks passed`);
let analysis;
const deadline = Date.now() + 20 * 60_000;
let previous;
while (Date.now() < deadline) {
  analysis = await json(`/api/analysis/${primary.analysis_id}`);
  const state = `${analysis.status}: ${analysis.progress}: ${analysis.current_step}`;
  if (state !== previous) { console.log(state); previous = state; }
  if (["completed", "failed"].includes(analysis.status)) break;
  await new Promise(resolve => setTimeout(resolve, 5000));
}
assert.equal(analysis.status, "completed", analysis.failure_reason);
const questions = await json(`/api/analysis/${primary.analysis_id}/questions`);
assert(questions.questions.length >= 3, "Expected at least three extracted questions");
const report = await json(`/api/reports/${analysis.report_id}`);
await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
for (const format of ["html", "pdf", "png"]) {
  const response = await fetch(`${base}/api/reports/${analysis.report_id}/export?format=${format}`, { signal: AbortSignal.timeout(180_000) });
  assert(response.ok, `${format} export: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (format === "pdf") assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  if (format === "png") assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  if (format === "html") {
    assert(bytes.toString().includes("report-document"));
    assert(bytes.toString().includes(`<base href="${base}/">`), "HTML must reference the public application URL");
  }
  await writeFile(`${out}/report.${format}`, bytes);
  console.log(`${format} export: ${bytes.length} bytes`);
}
console.log(JSON.stringify({ success: true, analysis_id: primary.analysis_id, report_id: analysis.report_id, questions: questions.questions.length, output: out }));
