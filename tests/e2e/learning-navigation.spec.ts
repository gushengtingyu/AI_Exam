import { expect, test, type Page } from "@playwright/test";

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
const task = {
  id: "task-one", title: "专项练习 · 分数运算", subject: "数学", knowledge_point: "分数运算",
  target_level: 3, target_count: 6, success_criteria: "完成练习并掌握解题方法",
  completed_count: 6, status: "completed", due_date: today, version: 2, session_id: "session-one",
};
const session = {
  id: "session-one", learner_id: "learner-one", task_id: task.id, task_title: task.title, plan_id: "plan-one",
  status: "completed", level: 3, version: 8, effective_attempts: 6, target_count: 6, max_attempts: 8,
  question_status: "ready", next_question: null, attempts: [{
    id: "attempt-one", client_attempt_id: "client-one", question_id: "question-one",
    question_content: "计算二分之一与四分之一的和。", answer: "3/4", grading_status: "graded",
    result: "correct", feedback: "计算正确", reference_answer: "3/4", explanation: "通分后相加。", version: 1,
  }],
};

async function setup(page: Page, active = false) {
  await page.route("**/api/learners", route => route.fulfill({ json: { learners: [{ id: "learner-one", nickname: "小林", grade: "七年级", version: 1 }] } }));
  await page.route("**/api/learners/learner-one/mastery", route => route.fulfill({ json: { mastery: [] } }));
  await page.route("**/api/learning-plans?*", route => route.fulfill({ json: { plans: [{
    id: "plan-one", learner_id: "learner-one", learner_name: "小林", cycle_days: 7, status: "active", version: 1, revision: 1,
    tasks: [{ ...task, ...(active ? { status: "active", completed_count: 0 } : {}) },
      { ...task, id: "task-future", title: "下一阶段练习", due_date: "2099-01-01", status: "pending", completed_count: 0, session_id: null }],
  }] } }));
}

test("today tasks and completed practice history stay accessible on mobile", async ({ page }) => {
  await setup(page);
  let createRequests = 0;
  await page.route("**/api/learning-tasks/*/sessions", route => { createRequests++; return route.fulfill({ status: 409, json: { message: "不应重新创建练习" } }); });
  await page.route("**/api/practice-sessions/session-one", route => route.fulfill({ json: session }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/learning");
  await expect(page.getByRole("button", { name: "今日学习", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "下一阶段练习", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "全部安排", exact: true }).click();
  await expect(page.getByRole("heading", { name: "下一阶段练习", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "查看练习", exact: true }).click();
  await page.getByText("作答记录（1）", { exact: true }).click();
  await expect(page.getByText(session.attempts[0].question_content, { exact: true })).toBeVisible();
  await expect(page.getByText("我的答案：3/4", { exact: true })).toBeVisible();
  expect(createRequests).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.screenshot({ path: "test-results/learning-review-mobile.png", fullPage: true });
});

test("an in-flight refresh cannot reopen a practice after returning to the plan", async ({ page }) => {
  await setup(page, true);
  const waiting = { ...session, status: "active", version: 1, effective_attempts: 0, question_status: "generating", attempts: [] };
  await page.route("**/api/learning-tasks/task-one/sessions", route => route.fulfill({ status: 201, json: waiting }));
  let releaseRefresh: (() => void) | undefined;
  let received = false;
  await page.route("**/api/practice-sessions/session-one", async route => {
    received = true;
    await new Promise<void>(resolve => { releaseRefresh = resolve; });
    await route.fulfill({ json: { ...waiting, version: 2 } });
  });
  await page.goto("/learning");
  await page.getByRole("button", { name: "继续练习", exact: true }).click();
  await expect(page.getByRole("button", { name: "返回计划", exact: true })).toBeVisible();
  try {
    await expect.poll(() => received, { timeout: 12_000 }).toBe(true);
    await page.getByRole("button", { name: "返回计划", exact: true }).click();
    const response = page.waitForResponse("**/api/practice-sessions/session-one");
    releaseRefresh?.();
    await response;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.getByRole("button", { name: "返回计划", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "继续练习", exact: true })).toBeVisible();
  } finally { releaseRefresh?.(); }
});
