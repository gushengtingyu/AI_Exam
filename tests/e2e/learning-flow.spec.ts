import { test, expect } from "@playwright/test";

test("learning center works on desktop and a narrow phone viewport", async ({ page }) => {
  const nickname = `界面验收-${Date.now()}`;
  await page.goto("/learning");
  await expect(page.getByRole("heading", { name: "专注每一次进步" })).toBeVisible();
  await page.getByText("添加学生档案", { exact: true }).click();
  await page.getByLabel("昵称", { exact: true }).fill(nickname);
  await page.getByLabel("年级", { exact: true }).fill("七年级");
  await page.getByRole("button", { name: "保存档案" }).click();
  await expect(page.getByLabel("当前学生")).toContainText(nickname);
  await expect(page.getByRole("button", { name: "保存档案" })).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/learning-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole("heading", { name: "学生档案", exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: "test-results/learning-mobile.png", fullPage: true });
});
