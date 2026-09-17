import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

const pathPrefix = (process.env.E2E_PATH_PREFIX || "").replace(/\/$/, "");
const route = (path: string) => `${pathPrefix}${path}`;

function collectPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test("桌面端首页与报告页没有溢出或前端错误", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(route("/?audit=desktop"));
  await expect(page.getByRole("heading", { name: "学期试卷分析" })).toBeVisible();
  await expect(page.getByText("添加答案或评分标准")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /开始分析/ })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  await page.waitForTimeout(700);
  await page.screenshot({ path: "tmp/ui-audit/home-desktop.png", fullPage: true });

  const recentHref = await page.locator(".recent-item").first().getAttribute("href");
  expect(recentHref).toBeTruthy();
  if (recentHref?.includes("/reports/")) {
    await page.goto(recentHref);
    await expect(page.getByRole("link", { name: "下载 PDF" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    await page.waitForTimeout(700);
    await page.screenshot({ path: "tmp/ui-audit/report-desktop.png", fullPage: false });

    const taskHref = await page.getByRole("link", { name: /返回任务/ }).getAttribute("href");
    expect(taskHref).toBeTruthy();
    await page.goto(taskHref!);
    await expect(page.getByRole("heading", { name: /试卷分析/ })).toBeVisible();
    await page.screenshot({ path: "tmp/ui-audit/progress-desktop.png", fullPage: false });

    const reviewHref = await page.getByRole("link", { name: "逐题复核" }).getAttribute("href");
    expect(reviewHref).toBeTruthy();
    await page.goto(reviewHref!);
    await expect(page.getByRole("heading", { name: "逐题复核" })).toBeVisible();
    await page.screenshot({ path: "tmp/ui-audit/review-desktop.png", fullPage: false });
  }

  expect(errors).toEqual([]);
});

test("移动端首页没有横向溢出", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route("/?audit=mobile"));
  await expect(page.getByRole("heading", { name: "学期试卷分析" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  await page.waitForTimeout(700);
  await page.screenshot({ path: "tmp/ui-audit/home-mobile.png", fullPage: true });

  const recentHref = await page.locator(".recent-item").first().getAttribute("href");
  if (recentHref?.includes("/reports/")) {
    await page.goto(recentHref);
    await expect(page.getByRole("link", { name: "下载 PDF" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    await page.waitForTimeout(700);
    await page.screenshot({ path: "tmp/ui-audit/report-mobile.png", fullPage: false });

    const taskHref = await page.getByRole("link", { name: /返回任务/ }).getAttribute("href");
    await page.goto(taskHref!);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();

    const reviewHref = await page.getByRole("link", { name: "逐题复核" }).getAttribute("href");
    await page.goto(reviewHref!);
    await expect(page.getByRole("heading", { name: "逐题复核" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  }

  expect(errors).toEqual([]);
});

test("选择图片后立即显示文件反馈", async ({ page }) => {
  await page.goto(route("/"));
  const image = await sharp({
    create: { width: 300, height: 420, channels: 3, background: { r: 245, g: 245, b: 242 } },
  }).jpeg().toBuffer();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "物理试卷第一页.jpg",
    mimeType: "image/jpeg",
    buffer: image,
  });
  await expect(page.locator(".file-drop").first()).toContainText("已选 1 张");
  await expect(page.locator(".selected-file").first()).toContainText("物理试卷第一页.jpg");
  await expect(page.getByRole("button", { name: /开始分析/ })).toBeEnabled();
});
