import { existsSync } from "node:fs";
import { chromium, type Page } from "playwright-core";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appPath, BASE_PATH } from "@/lib/base-path";
import { apiError, notFound } from "@/lib/http";
import { REPORT_TEMPLATE_VERSION } from "@/lib/constants";
import { readPrivateFile, writeProcessedFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const globalExports = globalThis as unknown as { activeReportExports?: Map<string, Promise<Buffer>> };
const activeReportExports = globalExports.activeReportExports ?? new Map<string, Promise<Buffer>>();
if (!globalExports.activeReportExports) globalExports.activeReportExports = activeReportExports;

class ExportCapacityError extends Error {}

function chromiumPath() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter((value): value is string => Boolean(value));
  return candidates.find((candidate) => existsSync(candidate));
}

function attachmentName(student: string, format: string) {
  const extension = format === "png" ? "zip" : format;
  const suffix = format === "png" ? "报告图片（分页）" : "学期试卷分析报告";
  return `attachment; filename="semester-report.${extension}"; filename*=UTF-8''${encodeURIComponent(`${student}-${suffix}.${extension}`)}`;
}

async function preparePrintPage(page: Page, printUrl: string) {
  await page.goto(printUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector('[data-report-ready="true"]', { state: "attached", timeout: 30_000 });
  await page.waitForSelector(".report-document", { state: "attached", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll(".report-page[data-page]").length >= 7, undefined, { timeout: 30_000 });
  await page.waitForSelector(".report-title", { state: "visible", timeout: 30_000 });
  await page.waitForSelector(".report-summary p", { state: "visible", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(250);
  await page.waitForFunction(() => {
    const images = Array.from(document.images);
    return images.every((image) => image.complete && image.naturalWidth > 0);
  }, undefined, { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: "print" });
}

async function renderReportArtifact(printUrl: string, executablePath: string, format: "pdf" | "png") {
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking", "--disable-extensions"],
  });
  try {
    // 报告按 A4 宽度排版（210mm ≈ 794px），视口对齐到页面宽度，出图不带右侧空白
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1.6 });
    await preparePrintPage(page, printUrl);
    if (format === "png") {
      // 逐页出图再打包：单张长图（一万八千像素）在微信、打印里都没法用
      const sections = await page.$$(".report-page");
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (let index = 0; index < sections.length; index += 1) {
        const shot = await sections[index].screenshot({ type: "png" });
        const label = String(index + 1).padStart(2, "0");
        zip.file(`${label}.png`, shot);
      }
      return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
    }
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } }));
  } finally {
    await browser.close();
  }
}

async function getCachedArtifact(cacheKey: string, printUrl: string, executablePath: string, format: "pdf" | "png") {
  try {
    return { bytes: await readPrivateFile(cacheKey), hit: true };
  } catch {
    let pending = activeReportExports.get(cacheKey);
    if (!pending) {
      const limit = Math.max(1, Number(process.env.MAX_ACTIVE_REPORT_EXPORTS) || 1);
      if (activeReportExports.size >= limit) throw new ExportCapacityError();
      pending = renderReportArtifact(printUrl, executablePath, format).then(async (bytes) => {
        await writeProcessedFile(cacheKey, bytes);
        return bytes;
      });
      activeReportExports.set(cacheKey, pending);
    }
    try {
      return { bytes: await pending, hit: false };
    } finally {
      activeReportExports.delete(cacheKey);
    }
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const report = await db.report.findUnique({ where: { id }, include: { analysis: { select: { studentNickname: true } } } });
    if (!report) return notFound("报告不存在");
    const url = new URL(request.url);
    const format = url.searchParams.get("format");
    if (!new Set(["html", "pdf", "png"]).has(format || "")) {
      return NextResponse.json({ error: "validation_error", message: "format 仅支持 html、pdf 或 png" }, { status: 400 });
    }
    const renderBaseUrl = (process.env.APP_BASE_URL || url.origin).replace(/\/$/, "");
    const clientBaseUrl = new URL(process.env.PUBLIC_APP_ORIGIN || url.origin).origin;
    const printUrl = `${renderBaseUrl}${appPath(`/reports/${encodeURIComponent(id)}/print`)}`;

    if (format === "html") {
      const rendered = await fetch(printUrl, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (!rendered.ok) throw new Error("HTML 报告渲染失败");
      let html = await rendered.text();
      html = html.replace("<head>", `<head><base href="${clientBaseUrl}${BASE_PATH}/">`);
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": attachmentName(report.analysis.studentNickname, "html"),
          "Cache-Control": "private, no-store",
        },
      });
    }

    const executablePath = chromiumPath();
    if (!executablePath) throw new Error("服务器未找到 Chromium；请配置 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
    const artifactFormat = format === "png" ? "png" : "pdf";
    // 缓存键带上报告更新时间：重新生成报告或调整版式后，导出结果必须重建，
    // 否则会把旧渲染结果（可能缺页面或被裁切）继续发给用户
    const cacheKey = `report-${artifactFormat}s/${report.id}/data-v${report.version}-${REPORT_TEMPLATE_VERSION}-${report.updatedAt.getTime()}.${artifactFormat}`;
    const artifact = await getCachedArtifact(cacheKey, printUrl, executablePath, artifactFormat);
    return new NextResponse(new Uint8Array(artifact.bytes), {
      headers: {
        "Content-Type": artifactFormat === "png" ? "application/zip" : "application/pdf",
        "Content-Disposition": attachmentName(report.analysis.studentNickname, artifactFormat),
        "Cache-Control": "private, no-store",
        "X-Report-Cache": artifact.hit ? "HIT" : "MISS",
      },
    });
  } catch (error) {
    if (error instanceof ExportCapacityError) {
      return NextResponse.json({ error: "server_busy", message: "服务器正在导出其他报告，请稍后重试" }, { status: 503, headers: { "Retry-After": "10" } });
    }
    return apiError(error, "报告导出失败");
  }
}
