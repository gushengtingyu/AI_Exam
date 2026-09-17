import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, notFound } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const analysis = await db.analysis.findUnique({
      where: { id },
      include: { papers: { orderBy: { paperOrder: "asc" }, include: { questions: { orderBy: { questionNo: "asc" } } } } },
    });
    if (!analysis) return notFound("分析任务不存在");
    return NextResponse.json({
      analysis_id: id,
      job_id: null,
      report_id: null,
      status: analysis.status,
      questions: analysis.papers.flatMap((paper) =>
        paper.questions.map((question) => ({
          id: question.id,
          paper_id: paper.id,
          paper_name: paper.name,
          question_id: question.questionId,
          question_no: question.questionNo,
          question_text: question.questionText,
          student_answer: question.studentAnswer,
          score: question.score,
          max_score: question.maxScore,
          status: question.status,
          knowledge_points: question.knowledgePoints,
          error_tags: question.errorTags,
          error_analysis: question.errorAnalysis,
          ai_questions: question.aiPracticeQuestions,
          evidence: question.evidence,
          confidence: question.confidence,
          needs_review: question.needsReview,
          scoring_basis: question.scoringBasis,
          version: question.version,
        })),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
