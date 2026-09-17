import type { ReportSpec } from "@/lib/schemas";
import type { ReportStatistics } from "@/lib/stats";

export const REPORT_CAVEAT = "本分析基于所上传试卷样本，不等同于对完整学期表现的绝对评价。";

function statusCount(statistics: ReportStatistics, status: string) {
  return statistics.status.find((item) => item.status === status)?.count ?? 0;
}

function containsExcludedLanguage(value: string) {
  return /复核|确认|不确定|无法辨认|模糊/.test(value);
}

function safeRecommendations(recommendations: ReportSpec["recommendations"]) {
  const defaults: ReportSpec["recommendations"] = [
    {
      period: "下一次练习",
      title: "整理解题步骤",
      action: "针对本次暴露出的薄弱点，完整写出解题步骤并在结束后逐步检查。",
      success_measure: "能够独立完成同类题并写出完整步骤。",
    },
    {
      period: "持续练习",
      title: "巩固薄弱知识点",
      action: "围绕优先补强方向安排少量重复练习，记录每次容易出错的步骤。",
      success_measure: "同类题连续练习时，错误步骤明显减少。",
    },
  ];
  const usable = recommendations.filter((item) => !containsExcludedLanguage(`${item.period}${item.title}${item.action}${item.success_measure}`));
  return [...usable, ...defaults.filter((item) => !usable.some((current) => current.title === item.title))].slice(0, 4);
}

function sanitizeReportSpec(spec: ReportSpec): ReportSpec {
  return {
    ...spec,
    strengths: spec.strengths.filter((item) => !containsExcludedLanguage(`${item.title}${item.detail}`)),
    weaknesses: spec.weaknesses.filter((item) => !containsExcludedLanguage(`${item.title}${item.detail}`)),
    recommendations: safeRecommendations(spec.recommendations),
    caveat: REPORT_CAVEAT,
  };
}

function buildExecutiveSummary(statistics: ReportStatistics) {
  const { overview } = statistics;
  const evaluated = evaluatedQuestionCount(statistics);
  const correct = statusCount(statistics, "correct");
  const wrong = statusCount(statistics, "wrong");
  const partial = statusCount(statistics, "partial");
  const statusText = [correct ? `${correct} 正确` : "", wrong ? `${wrong} 错误` : "", partial ? `${partial} 部分得分` : ""]
    .filter(Boolean)
    .join("、");
  const scoreText = overview.overall_score_rate === null
    ? overview.overall_correct_rate === null ? "" : `答题正确率为 ${overview.overall_correct_rate}%。`
    : `可计分题得分率为 ${overview.overall_score_rate}%。`;
  return `共分析 ${overview.paper_count} 套试卷、${overview.question_count} 道题；${evaluated} 题已纳入明确判定${statusText ? `（${statusText}）` : ""}。${scoreText}`;
}

export function evaluatedQuestionCount(statistics: ReportStatistics) {
  const overview = statistics.overview as ReportStatistics["overview"] & { evaluated_question_count?: number };
  return overview.evaluated_question_count ?? statistics.status.reduce((sum, item) => sum + item.count, 0);
}

type EvidenceLimitedInput = {
  nickname: string;
  grade: string;
  subject: string;
  semester: string;
  statistics: ReportStatistics;
  evidenceQuestionIds?: string[];
};

export function buildEvidenceLimitedReportSpec(input: EvidenceLimitedInput): ReportSpec {
  return {
    title: `${input.nickname}的${input.subject}试卷分析`,
    subtitle: `${input.grade} · ${input.semester}`,
    executive_summary: "当前没有足够清晰、可验证的题目判定结果，因此暂不生成表现结论。",
    components: [
      "overview",
      "score_trend",
      "answer_status_pie",
      "error_distribution",
      "knowledge_heatmap",
      "strengths",
      "weaknesses",
      "recommendations",
      "question_evidence",
    ],
    strengths: [],
    weaknesses: [],
    recommendations: [
      {
        period: "现在",
        title: "补充清晰样本",
        action: "补充清晰、完整且能看见作答与批改结果的试卷图片。",
        success_measure: "形成可验证的题目状态。",
      },
      {
        period: "后续",
        title: "重新分析",
        action: "补充样本后重新分析，只保留有明确证据的题目。",
        success_measure: "报告形成可验证的状态分布与知识点表现。",
      },
    ],
    evidence_question_ids: [...new Set(input.evidenceQuestionIds ?? [])].slice(0, 8),
    caveat: REPORT_CAVEAT,
  };
}

export function enforceEvidenceBoundary(
  spec: ReportSpec,
  input: EvidenceLimitedInput,
): ReportSpec {
  if (evaluatedQuestionCount(input.statistics) === 0) return buildEvidenceLimitedReportSpec(input);
  // AI 写的宏观学情概述是报告的主结论，必须保留；程序统计口径另在封面小字给出，
  // 不要用统计句式把概述顶掉（此前概述被无条件覆盖，报告只剩一句数据罗列）
  // 保留 AI 概述原文；统计口径由报告封面按当前数据实时渲染，写死数据后容易过期
  const statisticsLine = buildExecutiveSummary(input.statistics);
  const summary = spec.executive_summary?.trim();
  return sanitizeReportSpec({
    ...spec,
    executive_summary: summary || statisticsLine,
  });
}
