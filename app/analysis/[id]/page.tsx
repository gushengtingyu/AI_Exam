import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { AnalysisStatus } from "@/components/AnalysisStatus";
import { db } from "@/lib/db";
import { isJobStale } from "@/lib/job-health";
import type { AnalysisMode } from "@/lib/analysis-modes";

export const dynamic = "force-dynamic";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const analysis = await db.analysis.findUnique({
    where: { id },
    include: {
      papers: { orderBy: { paperOrder: "asc" }, include: { images: { orderBy: { pageOrder: "asc" } }, _count: { select: { questions: true } } } },
      jobs: { orderBy: { createdAt: "desc" }, take: 1 },
      report: { select: { id: true } },
    },
  });
  if (!analysis) notFound();
  const payload = {
    analysis_id: analysis.id,
    job_id: analysis.jobs[0]?.id ?? null,
    report_id: analysis.report?.id ?? null,
    mode: analysis.mode as AnalysisMode,
    student_nickname: analysis.studentNickname,
    grade: analysis.grade,
    subject: analysis.subject,
    semester: analysis.semester,
    status: analysis.status,
    progress: analysis.progress,
    current_step: analysis.currentStep,
    failure_reason: analysis.failureReason,
    job_is_stale: isJobStale(analysis.jobs[0]),
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
        quality_status: image.qualityStatus,
        quality_score: image.qualityScore,
      })),
    })),
  };
  return <div className="app-shell"><AppHeader /><main className="main"><AnalysisStatus initial={payload} /></main></div>;
}
