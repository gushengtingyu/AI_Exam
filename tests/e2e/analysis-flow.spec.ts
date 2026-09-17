import { expect, test } from "@playwright/test";
import sharp from "sharp";

const pathPrefix = (process.env.E2E_PATH_PREFIX || "").replace(/\/$/, "");
const route = (path: string) => `${pathPrefix}${path}`;

test("上传到 HTML/PDF 报告形成完整异步闭环", async ({ request, page }) => {
  await page.goto(route("/"));
  await expect(page.getByRole("heading", { name: "学期试卷分析" })).toBeVisible();
  await expect(page.getByText("添加答案或评分标准")).toHaveCount(0);

  const png = await sharp({
    create: { width: 640, height: 900, channels: 3, background: { r: 244, g: 244, b: 240 } },
  }).png().toBuffer();
  const health = await (await request.get(route("/api/health"))).json();
  expect(health.api_contract_version).toBe("3.0.0");
  expect(health.capabilities).toMatchObject({
    analysis_modes: true,
    idempotency: true,
    explicit_page_order: true,
    server_report_artifacts: true,
    report_error_analysis: true,
  });

  const createPayload = {
      student_nickname: "端到端同学",
      grade: "七年级",
      subject: "数学",
      semester: "2026 秋季学期",
      papers: [
        { name: "九月月考", date: "2026-09-01", max_score: 100 },
        { name: "期中测试", date: "2026-10-20", max_score: 100 },
      ],
  };
  const createKey = `e2e-create-${Date.now()}-${Math.random()}`;
  const createdResponse = await request.post(route("/api/analysis"), {
    headers: { "Idempotency-Key": createKey },
    data: createPayload,
  });
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json();
  expect(created.idempotent_replay).toBe(false);
  const replayedCreate = await request.post(route("/api/analysis"), {
    headers: { "Idempotency-Key": createKey },
    data: createPayload,
  });
  expect(replayedCreate.status()).toBe(200);
  expect((await replayedCreate.json()).analysis_id).toBe(created.analysis_id);
  const conflictingCreate = await request.post(route("/api/analysis"), {
    headers: { "Idempotency-Key": createKey },
    data: { ...createPayload, semester: "冲突学期" },
  });
  expect(conflictingCreate.status()).toBe(409);

  for (const [paperIndex, paper] of created.papers.entries()) {
    const uploadKey = `${createKey}-paper-${paperIndex}`;
    const upload = await request.post(route(`/api/analysis/${created.analysis_id}/images`), {
      headers: { "Idempotency-Key": uploadKey },
      multipart: {
        paper_id: paper.paper_id,
        kind: "paper",
        page_order: "0",
        files: { name: `${paper.name}.png`, mimeType: "image/png", buffer: png },
      },
    });
    expect(upload.ok()).toBeTruthy();
    const uploadJson = await upload.json();
    expect(uploadJson.idempotent_replay).toBe(false);
    expect(uploadJson.images[0].page_order).toBe(0);
    const replayedUpload = await request.post(route(`/api/analysis/${created.analysis_id}/images`), {
      headers: { "Idempotency-Key": uploadKey },
      multipart: {
        paper_id: paper.paper_id,
        kind: "paper",
        page_order: "0",
        files: { name: `${paper.name}.png`, mimeType: "image/png", buffer: png },
      },
    });
    expect(replayedUpload.ok()).toBeTruthy();
    const replayedUploadJson = await replayedUpload.json();
    expect(replayedUploadJson.idempotent_replay).toBe(true);
    expect(replayedUploadJson.images[0].image_id).toBe(uploadJson.images[0].image_id);
    if (paperIndex === 0 && created.papers.length > 1) {
      const conflictingUpload = await request.post(route(`/api/analysis/${created.analysis_id}/images`), {
        headers: { "Idempotency-Key": uploadKey },
        multipart: {
          paper_id: created.papers[1].paper_id,
          kind: "paper",
          page_order: "0",
          files: { name: "conflict.png", mimeType: "image/png", buffer: png },
        },
      });
      expect(conflictingUpload.status()).toBe(409);
    }
  }
  const started = await request.post(route(`/api/analysis/${created.analysis_id}/start`));
  expect(started.status()).toBe(202);

  let status: Record<string, unknown> = {};
  await expect.poll(async () => {
    status = await (await request.get(route(`/api/analysis/${created.analysis_id}`))).json();
    return status.status;
  }, { timeout: 45_000 }).toBe("completed");

  expect(status.job_id).toBeTruthy();
  expect(status.report_id).toBeTruthy();
  const questions = await (await request.get(route(`/api/analysis/${created.analysis_id}/questions`))).json();
  expect(questions.questions.length).toBe(10);
  expect(questions.questions.every((question: { status: string }) => question.status !== "unknown")).toBeTruthy();

  const reviewQuestion = questions.questions.find((question: { needs_review: boolean }) => question.needs_review);
  expect(reviewQuestion).toBeTruthy();
  const patched = await request.patch(route(`/api/questions/${reviewQuestion.id}`), {
    data: { needs_review: false, knowledge_points: ["书面表达", "信息完整性"] },
  });
  expect(patched.ok()).toBeTruthy();

  const report = await request.get(route(`/api/reports/${status.report_id}`));
  expect(report.ok()).toBeTruthy();
  const reportJson = await report.json();
  expect(reportJson.schema_version).toBe("1.0.0");
  expect(reportJson.report_spec.components).toContain("knowledge_heatmap");
  const wrongQuestions = reportJson.questions.filter((question: { status: string }) => ["wrong", "partial", "blank"].includes(question.status));
  expect(wrongQuestions.length).toBeGreaterThan(0);
  expect(wrongQuestions.every((question: { ai_questions: unknown[] }) => question.ai_questions.length === 3)).toBeTruthy();
  expect(wrongQuestions.every((question: { error_analysis: string | null }) => Boolean(question.error_analysis))).toBeTruthy();

  const html = await request.get(route(`/api/reports/${status.report_id}/export?format=html`));
  expect(html.ok()).toBeTruthy();
  const htmlText = await html.text();
  expect(htmlText).toContain("学期卷析");
  expect(htmlText).toContain("AI 同类练习");

  const pdf = await request.get(route(`/api/reports/${status.report_id}/export?format=pdf`));
  expect(pdf.ok()).toBeTruthy();
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  const reportPng = await request.get(route(`/api/reports/${status.report_id}/export?format=png`));
  expect(reportPng.ok()).toBeTruthy();
  expect(reportPng.headers()["content-type"]).toContain("image/png");
  expect((await reportPng.body()).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

  await page.goto(route(`/reports/${status.report_id}`));
  await expect(page.getByRole("heading", { name: "学情诊断报告" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "知识与能力结构" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "错误结构与复盘优先级" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /错题深度复盘/ }).first()).toBeVisible();
  await expect(page.getByText("AI 同类练习").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "下载 PDF" })).toBeVisible();
  await expect(page.getByRole("link", { name: "下载图片" })).toBeVisible();
  await expect(page.getByText(/报告版本/)).toHaveCount(0);
  await expect(page.getByText("本分析基于所上传试卷样本，不等同于对完整学期表现的绝对评价。")).toHaveCount(0);
});
