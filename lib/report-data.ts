import { applyModeReport, buildModeEntries, resolveAnalysisMode } from "@/lib/analysis-modes";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { evidenceSchema, practiceQuestionSchema, reportSpecSchema } from "@/lib/schemas";
import { computeStatistics } from "@/lib/stats";
import type { AiPracticeQuestion, Evidence, ReportViewData } from "@/lib/report-types";
import { enforceEvidenceBoundary, evaluatedQuestionCount } from "@/lib/report-quality";

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

function evidenceList(value: unknown): Evidence[] {
  const result = evidenceSchema.array().safeParse(value);
  return result.success ? result.data : [];
}

function aiPracticeQuestionList(value: unknown): AiPracticeQuestion[] {
  const result = practiceQuestionSchema.array().safeParse(value);
  return result.success ? result.data.slice(0, 3) : [];
}

export async function findReportViewData(id: string): Promise<ReportViewData | null> {
  const report = await db.report.findUnique({
    where: { id },
    include: { analysis: { include: { papers: { orderBy: { paperOrder: "asc" }, include: { questions: { orderBy: { questionNo: "asc" } } } } } } },
  });
  if (!report) return null;
  const mode = resolveAnalysisMode(report.analysis.mode, report.analysis.papers.length);
  const entries = buildModeEntries(report.analysis.papers, report.analysis.studentNickname, mode);
  const storedStatistics = computeStatistics(report.analysis.papers);
  const statistics = {
    ...storedStatistics,
    trend: mode === "SINGLE_STUDENT_MULTIPLE_PAPERS" ? [...storedStatistics.trend].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999")) : storedStatistics.trend,
    overview: { ...storedStatistics.overview, evaluated_question_count: evaluatedQuestionCount(storedStatistics) },
  };
  // 逐题表现展示全部题目（含待复核项，仅统计口径排除）；并按题号自然排序（15(2) → 15、2）
  const questionOrder = (no: string) => (String(no).match(/\d+/g) ?? ["0"]).map(Number);
  const questions = report.analysis.papers.flatMap((paper) => paper.questions.map((q) => ({
    id: q.id,
    paper_id: paper.id,
    paper_name: paper.name,
    student_nickname: paper.studentNickname ?? report.analysis.studentNickname,
    question_id: mode === "MULTIPLE_STUDENTS_SINGLE_PAPER" ? paper.id + ":" + q.questionId : q.questionId,
    question_no: q.questionNo,
    question_text: q.questionText,
    student_answer: q.studentAnswer,
    status: q.status,
    score: q.score,
    max_score: q.maxScore,
    knowledge_points: stringList(q.knowledgePoints),
    error_tags: stringList(q.errorTags),
    error_analysis: q.errorAnalysis,
    evidence: evidenceList(q.evidence),
    confidence: q.confidence,
    scoring_basis: q.scoringBasis,
    difficulty: q.difficulty ?? null,
    ai_questions: aiPracticeQuestionList(q.aiPracticeQuestions),
  })));
  // 去重保护：同一试卷下题号相同的条目只保留信息最全的一条（优先有判定结论、有证据、有得分），
  // 避免历史数据里 q15_1 / q15-1 这类同题不同 id 的残留在报告里出现两次
  const deduped = new Map<string, (typeof questions)[number]>();
  for (const question of questions) {
    const key = `${question.paper_id}#${String(question.question_no).trim()}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, question);
      continue;
    }
    const weight = (item: typeof question) => (item.status !== "unknown" ? 4 : 0) + (item.evidence.length > 0 ? 2 : 0) + (item.score !== null ? 1 : 0);
    if (weight(question) > weight(existing)) deduped.set(key, question);
  }
  const uniqueQuestions = [...deduped.values()];
  uniqueQuestions.sort((a, b) => {
    const ao = questionOrder(a.question_no);
    const bo = questionOrder(b.question_no);
    for (let index = 0; index < Math.max(ao.length, bo.length); index += 1) {
      const diff = (ao[index] ?? 0) - (bo[index] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });
  const spec = enforceEvidenceBoundary(reportSpecSchema.parse(report.reportSpec), {
    nickname: report.analysis.studentNickname,
    grade: report.analysis.grade,
    subject: report.analysis.subject,
    semester: report.analysis.semester,
    statistics,
    evidenceQuestionIds: questions.filter((question) => question.evidence.length > 0).map((question) => question.question_id),
  });
  return {
    mode, entries,
    id: report.id,
    analysisId: report.analysisId,
    schemaVersion: report.schemaVersion,
    status: report.status,
    templateVersion: report.templateVersion,
    version: report.version,
    generatedAt: report.createdAt.toISOString(),
    student: { nickname: report.analysis.studentNickname, grade: report.analysis.grade, subject: report.analysis.subject, semester: report.analysis.semester },
    statistics,
    spec: applyModeReport(spec, mode, entries),
    questions: uniqueQuestions,
  };
}

export async function getReportViewData(id: string): Promise<ReportViewData> {
  const data = await findReportViewData(id);
  if (!data) notFound();
  return data;
}
