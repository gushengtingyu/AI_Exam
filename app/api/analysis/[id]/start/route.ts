import { after, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, notFound } from "@/lib/http";
import { startAnalysisPipeline } from "@/lib/ai/pipeline";
import { isJobStale, jobStaleAfterMs } from "@/lib/job-health";

class AnalysisCapacityError extends Error {}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const analysis = await db.analysis.findUnique({
      where: { id },
      include: { papers: { include: { _count: { select: { images: true } } } }, report: true, jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!analysis) return notFound("分析任务不存在");
    const imageCount = analysis.papers.reduce((sum, paper) => sum + paper._count.images, 0);
    // 多人同卷的试卷与答案可只上传一份（挂在某套上并标记 shared），其他学生只要有答题卡即可
    const sharedImageCount = await db.paperImage.count({ where: { shared: true, paper: { analysisId: id } } });
    if (imageCount === 0) {
      return NextResponse.json({ error: "validation_error", message: "这个任务还没有任何图片：请回到任务页上传试卷/答题卡后重试（若上次上传时服务正在重启，图片不会入库，需要重新上传）" }, { status: 400 });
    }
    const missing = analysis.papers.filter(paper => paper._count.images === 0 && sharedImageCount === 0);
    if (missing.length > 0) {
      const names = missing.map(paper => paper.studentNickname ? `${paper.studentNickname}（${paper.name}）` : paper.name).join("、");
      return NextResponse.json({ error: "validation_error", message: `以下试卷/学生还没有图片：${names}` }, { status: 400 });
    }
    const running = analysis.jobs[0];
    if (running && ["queued", "running"].includes(running.status) && !isJobStale(running) && running.runToken) {
      return NextResponse.json({ analysis_id: id, job_id: running.id, report_id: analysis.report?.id ?? null, status: analysis.status });
    }
    if (running && (isJobStale(running) || !running.runToken)) {
      await db.$transaction([
        db.job.update({
          where: { id: running.id },
          data: { status: "failed", error: "处理进程已中断", completedAt: new Date(), lockKey: null },
        }),
        db.analysis.updateMany({ where: { id, activeRunToken: running.runToken }, data: { activeRunToken: null } }),
      ]);
    }
    let job: { id: string; runToken: string };
    try {
      job = await db.$transaction(async (tx) => {
        const limit = Math.max(1, Number(process.env.MAX_ACTIVE_ANALYSES) || 1);
        const active = await tx.job.count({ where: {
          status: { in: ["queued", "running"] },
          updatedAt: { gte: new Date(Date.now() - jobStaleAfterMs()) },
          runToken: { not: null },
        } });
        if (active >= limit) throw new AnalysisCapacityError();
        const created = await tx.job.create({ data: { analysisId: id, lockKey: id, runToken: randomUUID(), status: "queued", currentStep: "等待处理" } });
        if (!created.runToken) throw new Error("分析任务缺少执行令牌");
        await tx.analysis.update({ where: { id }, data: { status: "preprocessing", progress: 6, currentStep: "等待图像预处理", failureReason: null, activeRunToken: created.runToken } });
        return { id: created.id, runToken: created.runToken };
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const activeJob = await db.job.findUnique({ where: { lockKey: id } });
      if (!activeJob) throw error;
      return NextResponse.json({ analysis_id: id, job_id: activeJob.id, report_id: analysis.report?.id ?? null, status: analysis.status }, { status: 202 });
    }
    after(() => startAnalysisPipeline(id, job.id, job.runToken).catch(() => undefined));
    return NextResponse.json({ analysis_id: id, job_id: job.id, report_id: analysis.report?.id ?? null, status: "preprocessing" }, { status: 202 });
  } catch (error) {
    if (error instanceof AnalysisCapacityError) {
      return NextResponse.json({ error: "server_busy", message: "服务器正在分析其他试卷，请稍后重试" }, { status: 503, headers: { "Retry-After": "30" } });
    }
    return apiError(error, "无法启动分析");
  }
}
