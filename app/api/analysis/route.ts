import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createAnalysisSchema } from "@/lib/schemas";
import { apiError } from "@/lib/http";

import { resolveAnalysisMode } from "@/lib/analysis-modes";

export const dynamic = "force-dynamic";

type AnalysisWithPapers = Prisma.AnalysisGetPayload<{ include: { papers: true } }>;

function idempotencyKey(request: Request) {
  const value = request.headers.get("Idempotency-Key")?.trim();
  return value || null;
}

function responseBody(analysis: AnalysisWithPapers, replay: boolean) {
  return {
    analysis_id: analysis.id,
    mode: analysis.mode,
    job_id: null,
    report_id: null,
    status: analysis.status,
    idempotent_replay: replay,
    papers: [...analysis.papers]
      .sort((a, b) => a.paperOrder - b.paperOrder)
      .map((paper) => ({ paper_id: paper.id, name: paper.name })),
  };
}

function matchesRequest(analysis: AnalysisWithPapers, input: ReturnType<typeof createAnalysisSchema.parse>) {
  const mode = resolveAnalysisMode(input.mode, input.papers.length);
  const papers = [...analysis.papers].sort((a, b) => a.paperOrder - b.paperOrder);
  return analysis.mode === mode
    && (analysis.learnerId ?? null) === (input.learner_id ?? null)
    && analysis.studentNickname === input.student_nickname
    && analysis.grade === input.grade
    && analysis.subject === input.subject
    && analysis.semester === input.semester
    && papers.length === input.papers.length
    && papers.every((paper, index) => {
      const candidate = input.papers[index];
      return paper.name === candidate.name
        && (paper.learnerId ?? null) === (candidate.learner_id ?? null)
        && (paper.studentNickname ?? null) === (candidate.student_nickname ?? null)
        && (paper.examDate?.toISOString().slice(0, 10) ?? null) === (candidate.date ?? null)
        && (paper.maxScore ?? null) === (candidate.max_score ?? null);
    });
}

export async function POST(request: Request) {
  const requestKey = idempotencyKey(request);
  let parsedInput: ReturnType<typeof createAnalysisSchema.parse> | null = null;
  try {
    if (requestKey && requestKey.length > 200) {
      return NextResponse.json({ error: "validation_error", message: "Idempotency-Key 最多 200 个字符" }, { status: 400 });
    }
    const input = createAnalysisSchema.parse(await request.json());
    parsedInput = input;
    const learnerIds = [...new Set([input.learner_id, ...input.papers.map(paper => paper.learner_id)].filter((id): id is string => Boolean(id)))];
    if (learnerIds.length && await db.learner.count({ where: { id: { in: learnerIds }, status: "active" } }) !== learnerIds.length) {
      return NextResponse.json({ error: "validation_error", message: "学生档案不存在或不可用" }, { status: 400 });
    }
    if (requestKey) {
      const existing = await db.analysis.findUnique({ where: { clientRequestId: requestKey }, include: { papers: true } });
      if (existing) {
        if (!matchesRequest(existing, input)) {
          return NextResponse.json({ error: "idempotency_conflict", message: "该 Idempotency-Key 已用于不同的分析请求" }, { status: 409 });
        }
        return NextResponse.json(responseBody(existing, true), { headers: { "X-Idempotent-Replay": "true" } });
      }
    }
    const analysis = await db.analysis.create({
      data: {
        clientRequestId: requestKey,
        learnerId: input.learner_id,
        mode: resolveAnalysisMode(input.mode, input.papers.length),
        studentNickname: input.student_nickname,
        grade: input.grade,
        subject: input.subject,
        semester: input.semester,
        papers: {
          create: input.papers.map((paper, index) => ({
            name: paper.name,
            learnerId: paper.learner_id,
            studentNickname: input.mode === "MULTIPLE_STUDENTS_SINGLE_PAPER" ? paper.student_nickname : null,
            examDate: paper.date ? new Date(`${paper.date}T00:00:00Z`) : null,
            maxScore: paper.max_score ?? null,
            paperOrder: index,
          })),
        },
      },
      include: { papers: { orderBy: { paperOrder: "asc" } } },
    });
    return NextResponse.json(responseBody(analysis, false), { status: 201, headers: { "X-Idempotent-Replay": "false" } });
  } catch (error) {
    if (requestKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.analysis.findUnique({ where: { clientRequestId: requestKey }, include: { papers: true } });
      if (existing && parsedInput) {
        if (!matchesRequest(existing, parsedInput)) {
          return NextResponse.json({ error: "idempotency_conflict", message: "该 Idempotency-Key 已用于不同的分析请求" }, { status: 409 });
        }
        return NextResponse.json(responseBody(existing, true), { headers: { "X-Idempotent-Replay": "true" } });
      }
    }
    return apiError(error);
  }
}
