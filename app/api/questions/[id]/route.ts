import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, notFound } from "@/lib/http";
import { patchQuestionSchema } from "@/lib/schemas";
import { refreshReportStatistics } from "@/lib/ai/pipeline";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const current = await db.question.findUnique({ where: { id }, include: { paper: true } });
    if (!current) return notFound("题目不存在");
    const input = patchQuestionSchema.parse(await request.json());
    const question = await db.question.update({
      where: { id },
      data: {
        ...(input.question_text !== undefined ? { questionText: input.question_text } : {}),
        ...(input.student_answer !== undefined ? { studentAnswer: input.student_answer } : {}),
        ...(input.score !== undefined ? { score: input.score } : {}),
        ...(input.max_score !== undefined ? { maxScore: input.max_score } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.knowledge_points !== undefined ? { knowledgePoints: input.knowledge_points as Prisma.InputJsonValue } : {}),
        ...(input.error_tags !== undefined ? { errorTags: input.error_tags as Prisma.InputJsonValue } : {}),
        ...(input.needs_review !== undefined ? { needsReview: input.needs_review } : {}),
        ...(input.scoring_basis !== undefined ? { scoringBasis: input.scoring_basis } : {}),
        version: { increment: 1 },
      },
    });
    await refreshReportStatistics(current.paper.analysisId);
    return NextResponse.json({
      question_id: question.id,
      analysis_id: current.paper.analysisId,
      job_id: null,
      report_id: null,
      status: "updated",
      version: question.version,
    });
  } catch (error) {
    return apiError(error, "保存复核结果失败");
  }
}
