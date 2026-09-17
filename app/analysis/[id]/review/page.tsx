import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { QuestionReview } from "@/components/QuestionReview";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const analysis = await db.analysis.findUnique({
    where: { id },
    include: { report: { select: { id: true } }, papers: { orderBy: { paperOrder: "asc" }, include: { questions: { orderBy: { questionNo: "asc" } } } } },
  });
  if (!analysis) notFound();
  const questions = analysis.papers.flatMap((paper) => paper.questions.map((q) => ({
    id: q.id,
    paper_id: paper.id,
    paper_name: paper.name,
    question_id: q.questionId,
    question_no: q.questionNo,
    question_text: q.questionText,
    student_answer: q.studentAnswer,
    score: q.score,
    max_score: q.maxScore,
    status: q.status as "correct" | "wrong" | "partial" | "blank" | "unknown",
    knowledge_points: Array.isArray(q.knowledgePoints) ? q.knowledgePoints as string[] : [],
    error_tags: Array.isArray(q.errorTags) ? q.errorTags as string[] : [],
    evidence: Array.isArray(q.evidence) ? q.evidence as Array<{ image_id: string; bbox: { x: number; y: number; width: number; height: number } }> : [],
    confidence: q.confidence,
    needs_review: q.needsReview,
    scoring_basis: q.scoringBasis as "teacher_mark" | "answer_key" | "model" | "unavailable",
    version: q.version,
  })));
  return <div className="app-shell"><AppHeader /><main className="main"><QuestionReview analysisId={id} reportId={analysis.report?.id ?? null} initial={questions} /></main></div>;
}
