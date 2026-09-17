import { readFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.APP_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const args = process.argv.slice(2);
const paperGroups = [];
let currentGroup = [];
for (const argument of args) {
  if (argument === "--paper") {
    if (currentGroup.length) paperGroups.push(currentGroup);
    currentGroup = [];
  } else {
    currentGroup.push(argument);
  }
}
if (currentGroup.length) paperGroups.push(currentGroup);
const imagePaths = paperGroups.flat();

if (imagePaths.length === 0) {
  throw new Error("Usage: node scripts/smoke-local-api.mjs [--paper] <image-path> [more-image-paths...]");
}

async function expectJson(response, label) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${payload.message || payload.error || "unknown error"}`);
  }
  return payload;
}

const created = await expectJson(
  await fetch(`${baseUrl}/api/analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      student_nickname: "真实接口校验",
      grade: "九年级",
      subject: "数学",
      semester: "2026 秋季学期",
      papers: paperGroups.map((_, index) => ({ name: `真实样本 ${index + 1}`, date: "2026-09-06", max_score: null })),
    }),
  }),
  "create analysis",
);

for (let paperIndex = 0; paperIndex < paperGroups.length; paperIndex += 1) {
  const uploadForm = new FormData();
  uploadForm.append("paper_id", created.papers[paperIndex].paper_id);
  uploadForm.append("kind", "paper");
  for (const imagePath of paperGroups[paperIndex]) {
    const image = await readFile(imagePath);
    uploadForm.append("files", new Blob([image], { type: "image/jpeg" }), path.basename(imagePath));
  }
  await expectJson(
    await fetch(`${baseUrl}/api/analysis/${created.analysis_id}/images`, { method: "POST", body: uploadForm }),
    `upload paper ${paperIndex + 1}`,
  );
}

const started = await expectJson(
  await fetch(`${baseUrl}/api/analysis/${created.analysis_id}/start`, { method: "POST" }),
  "start analysis",
);
console.log(`started analysis=${created.analysis_id} job=${started.job_id}`);

const deadline = Date.now() + 10 * 60_000;
let lastState = "";
let analysis;
while (Date.now() < deadline) {
  analysis = await expectJson(await fetch(`${baseUrl}/api/analysis/${created.analysis_id}`), "read analysis");
  const state = `${analysis.status}:${analysis.progress}:${analysis.current_step || ""}`;
  if (state !== lastState) {
    console.log(state);
    lastState = state;
  }
  if (["completed", "failed"].includes(analysis.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}

if (!analysis || analysis.status !== "completed") {
  throw new Error(`analysis did not complete: ${analysis?.failure_reason || analysis?.status || "timeout"}`);
}

const questionPayload = await expectJson(
  await fetch(`${baseUrl}/api/analysis/${created.analysis_id}/questions`),
  "read questions",
);
const reportPayload = await expectJson(
  await fetch(`${baseUrl}/api/reports/${analysis.report_id}`),
  "read report",
);
const html = await fetch(`${baseUrl}/api/reports/${analysis.report_id}/export?format=html`);
const pdf = await fetch(`${baseUrl}/api/reports/${analysis.report_id}/export?format=pdf`);
if (!html.ok || !pdf.ok) throw new Error(`report export failed (html=${html.status}, pdf=${pdf.status})`);
const pdfBytes = new Uint8Array(await pdf.arrayBuffer());
const pdfMagic = Buffer.from(pdfBytes.subarray(0, 5)).toString("ascii");
if (pdfMagic !== "%PDF-") throw new Error("PDF export returned an invalid file");

console.log(
  JSON.stringify({
    analysis_id: created.analysis_id,
    report_id: analysis.report_id,
    questions: questionPayload.questions.length,
    schema_version: reportPayload.schema_version,
    html: "ok",
    pdf: "ok",
  }),
);
