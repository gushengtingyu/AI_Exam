import { computeStatistics } from "./stats";
import type { ReportSpec } from "./schemas";

export const ANALYSIS_MODES = ["SINGLE_STUDENT_SINGLE_PAPER", "SINGLE_STUDENT_MULTIPLE_PAPERS", "MULTIPLE_STUDENTS_SINGLE_PAPER"] as const;
export type AnalysisMode = typeof ANALYSIS_MODES[number];
export function resolveAnalysisMode(mode: string | undefined, paperCount: number): AnalysisMode {
  if (ANALYSIS_MODES.includes(mode as AnalysisMode)) return mode as AnalysisMode;
  return paperCount > 1 ? "SINGLE_STUDENT_MULTIPLE_PAPERS" : "SINGLE_STUDENT_SINGLE_PAPER";
}
export const modeTitles: Record<AnalysisMode, string> = {
  SINGLE_STUDENT_SINGLE_PAPER: "学情诊断报告",
  SINGLE_STUDENT_MULTIPLE_PAPERS: "学情诊断报告",
  MULTIPLE_STUDENTS_SINGLE_PAPER: "学情诊断报告",
};
export const modeInstructions: Record<AnalysisMode, string> = {
  SINGLE_STUDENT_SINGLE_PAPER: "只诊断当前学生这一次试卷，不推断历史趋势。围绕卷面结构、稳定得分、过程分损失、知识点表现和错题证据形成结论；复习安排要明确到周、题量、动作和复测标准。",
  SINGLE_STUDENT_MULTIPLE_PAPERS: "同一学生多套试卷，按考试日期比较总分、知识点和错误类型，区分持续增长、阶段平台、单次波动与反复失分点。不得忽略试卷难度差异，日期或同口径数据不足时不判断进步退步；行动计划要说明如何验证趋势是否稳定。",
  MULTIPLE_STUDENTS_SINGLE_PAPER: "同一套试卷由不同学生作答，paper_id 对应独立学生作答。生成教师视角的班级分布、共性优势、共性薄弱、学生分层、课堂任务和复测标准，不得写成一个学生的历史趋势；题数统计是作答题次。所有证据使用 paper_id:question_id，不能混淆学生。",
};
type Paper = Parameters<typeof computeStatistics>[0][number] & { studentNickname?: string | null };
export function buildModeEntries(papers: Paper[], nickname: string, mode: AnalysisMode) {
  const ordered = mode === "SINGLE_STUDENT_MULTIPLE_PAPERS"
    ? [...papers].sort((a, b) => (a.examDate?.getTime() ?? Infinity) - (b.examDate?.getTime() ?? Infinity)) : papers;
  return ordered.map((paper) => {
    const stats = computeStatistics([paper]);
    const scoredKnowledge = stats.knowledge.filter(k => k.mastery !== null && k.basis === "score");
    return {
      paperId: paper.id,
      studentNickname: mode === "MULTIPLE_STUDENTS_SINGLE_PAPER" ? paper.studentNickname ?? "未命名学生" : nickname,
      paperName: paper.name, examDate: paper.examDate?.toISOString().slice(0, 10) ?? "",
      scoreRate: stats.overview.overall_score_rate,
      answeredCount: stats.overview.evaluated_question_count, questionCount: stats.overview.question_count,
      needsReviewCount: paper.questions.filter((question) => question.needsReview).length,
      strengths: scoredKnowledge.filter(k => k.mastery! >= 80).map(k => k.name + "：可计分题得分率 " + k.mastery + "%"),
      improvements: scoredKnowledge.filter(k => k.mastery! < 60).map(k => k.name + "：可计分题得分率 " + k.mastery + "%，建议对照错题复习"),
    };
  });
}
export type ModeEntry = ReturnType<typeof buildModeEntries>[number];
export function applyModeReport(spec: ReportSpec, mode: AnalysisMode, entries: ModeEntry[]): ReportSpec {
  const group = mode === "MULTIPLE_STUDENTS_SINGLE_PAPER";
  return {
    ...spec, title: modeTitles[mode],
    executive_summary: group
      ? (() => {
          // 与单卷模式同一原则：AI 写的宏观结论是主结论，班级口径说明只追加在后面
          const scopeLine = "同一套试卷，共 " + entries.length + " 位学生，" + entries.reduce((n, e) => n + e.questionCount, 0)
            + " 个作答题次；已纳入明确判定的 " + entries.reduce((n, e) => n + e.answeredCount, 0)
            + " 题次。个人结果见学生表现，整体结论不代表每位学生。";
          const summary = spec.executive_summary?.trim();
          return summary ? summary + "（" + scopeLine + "）" : scopeLine;
        })()
      : spec.executive_summary,
    caveat: group ? "统计范围为本次同卷作答学生；题数为作答题次，综合得分率按可计分题总得分/总分计算。缺失分值不得用于排名。" : spec.caveat,
  };
}
