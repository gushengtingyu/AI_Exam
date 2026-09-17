import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, notFound } from "@/lib/http";
import { isJobStale } from "@/lib/job-health";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const analysis = await db.analysis.findUnique({
      where: { id },
      include: {
        papers: { orderBy: { paperOrder: "asc" }, include: { images: { orderBy: { pageOrder: "asc" } }, _count: { select: { questions: true } } } },
        jobs: { orderBy: { createdAt: "desc" }, take: 1 },
        report: { select: { id: true, status: true, version: true } },
      },
    });
    if (!analysis) return notFound("分析任务不存在");
    const job = analysis.jobs[0] ?? null;
    const jobIsStale = isJobStale(job);
    return NextResponse.json({
      analysis_id: analysis.id,
      mode: analysis.mode,
      job_id: job?.id ?? null,
      report_id: analysis.report?.id ?? null,
      student_nickname: analysis.studentNickname,
      grade: analysis.grade,
      subject: analysis.subject,
      semester: analysis.semester,
      status: analysis.status,
      progress: analysis.progress,
      current_step: analysis.currentStep,
      failure_reason: analysis.failureReason,
      job_is_stale: jobIsStale,
      created_at: analysis.createdAt,
      papers: analysis.papers.map((paper) => ({
        paper_id: paper.id,
        name: paper.name,
        student_nickname: paper.studentNickname,
        date: paper.examDate?.toISOString().slice(0, 10) ?? null,
        max_score: paper.maxScore,
        question_count: paper._count.questions,
        images: paper.images.map((image) => ({
          image_id: image.id,
          file_name: image.fileName,
          kind: image.kind,
          page_order: image.pageOrder,
          quality_status: image.qualityStatus,
          quality_score: image.qualityScore,
        })),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
