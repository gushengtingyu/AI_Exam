import { QUESTION_STATUSES } from "@/lib/constants";

export type QuestionLike = {
  questionId: string;
  questionNo?: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  knowledgePoints: unknown;
  errorTags: unknown;
  needsReview: boolean;
  /** 卷面难度：基础 / 中档 / 难题 */
  difficulty?: string | null;
};

/** 难度分组顺序：先基础后难题，未标注排在最后 */
const DIFFICULTY_ORDER = ["基础", "中档", "难题"];

type PaperLike = {
  id: string;
  name: string;
  examDate: Date | null;
  /** 建卷时填写的满分 */
  maxScore?: number | null;
  /** 扫描读取的卷面总分（教师手写或扫描系统打印） */
  totalScore?: number | null;
  /** 扫描读取的卷面印刷满分 */
  scannedMaxScore?: number | null;
  questions: QuestionLike[];
};

export type ReportStatistics = ReturnType<typeof computeStatistics>;

export function isReportableQuestion(question: Pick<QuestionLike, "status" | "needsReview">) {
  return question.status !== "unknown" && !question.needsReview;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

/** 题号自然排序：Q2 排在 Q10 前面，15(2) 排在 15(10) 前面 */
function sortQuestionNos(values: string[]) {
  return [...new Set(values)].sort((a, b) => {
    const an = (a.match(/\d+/g) ?? []).map(Number);
    const bn = (b.match(/\d+/g) ?? []).map(Number);
    for (let index = 0; index < Math.max(an.length, bn.length); index += 1) {
      const diff = (an[index] ?? 0) - (bn[index] ?? 0);
      if (diff !== 0) return diff;
    }
    return a.localeCompare(b, "zh-CN");
  });
}

function knowledgeKey(value: string) {
  return value.replace(/[\s·、，,。]/g, "").replace(/的/g, "").toLocaleLowerCase("zh-CN");
}

const errorTagNames: Record<string, string> = {
  concept: "概念理解",
  conceptual: "概念理解",
  conceptmisunderstanding: "概念理解",
  conceptualerror: "概念理解",
  calculation: "计算错误",
  calculationerror: "计算错误",
  arithmeticerror: "计算错误",
  careless: "粗心失误",
  carelessmistake: "粗心失误",
  comprehension: "审题偏差",
  readingcomprehension: "审题偏差",
  misreading: "审题偏差",
  reasoning: "推理错误",
  reasoningerror: "推理错误",
  expression: "表达不完整",
  incompleteexpression: "表达不完整",
  steps: "步骤缺失",
  missingsteps: "步骤缺失",
  method: "方法选择",
  wrongmethod: "方法选择",
  blank: "空题",
};

export function localizeErrorTag(value: string) {
  const trimmed = value.trim();
  const key = trimmed.toLocaleLowerCase("en-US").replace(/[\s_-]+/g, "");
  if (errorTagNames[key]) return errorTagNames[key];
  return /^[a-z][a-z\s_-]*$/i.test(trimmed) ? "其他错误" : trimmed;
}

export function computeStatistics(papers: PaperLike[]) {
  const reportablePapers = papers.map((paper) => ({
    ...paper,
    questions: paper.questions.filter(isReportableQuestion),
  }));
  // 统计口径只用可判定的题；但“共多少道题”必须按卷面题数算，
  // 否则会出现“19 题的卷子报告写 18 题”这种口径错位
  const allQuestions = reportablePapers.flatMap((paper) => paper.questions);
  const totalQuestionCount = papers.reduce((sum, paper) => sum + paper.questions.length, 0);
  const undecidedCount = papers.reduce(
    (sum, paper) => sum + paper.questions.filter((question) => !isReportableQuestion(question)).length,
    0,
  );
  const trend = reportablePapers.map((paper) => {
    const scored = paper.questions.filter((q) => q.score !== null && q.maxScore !== null);
    const evaluated = paper.questions.filter((q) => q.status !== "unknown");
    const correct = evaluated.filter((q) => q.status === "correct").length;
    const score = scored.reduce((sum, q) => sum + (q.score ?? 0), 0);
    const scoredMax = scored.reduce((sum, q) => sum + (q.maxScore ?? 0), 0);
    // 卷面口径优先：扫描读到的总分/满分最接近试卷真实分值；缺失时回退到建卷填写值与逐题合计
    const declaredMax = typeof paper.scannedMaxScore === "number" && paper.scannedMaxScore > 0
      ? paper.scannedMaxScore
      : typeof paper.maxScore === "number" && paper.maxScore > 0
        ? paper.maxScore
        : scoredMax > 0 ? scoredMax : null;
    const reportedTotal = typeof paper.totalScore === "number" ? paper.totalScore : Number(score.toFixed(1));
    return {
      paper_id: paper.id,
      name: paper.name,
      date: paper.examDate?.toISOString().slice(0, 10) ?? null,
      score: Number(score.toFixed(1)),
      max_score: Number(scoredMax.toFixed(1)),
      // 逐题识别合计（可能与卷面总分有差异，用于对账展示）
      itemized_score_rate: scoredMax > 0 ? Number(((score / scoredMax) * 100).toFixed(1)) : null,
      // 卷面总分与卷面满分（扫描读取）
      scanned_total_score: typeof paper.totalScore === "number" ? Number(paper.totalScore.toFixed(1)) : null,
      declared_max_score: declaredMax === null ? null : Number(declaredMax.toFixed(1)),
      score_rate: declaredMax !== null && declaredMax > 0 ? Number(((reportedTotal / declaredMax) * 100).toFixed(1)) : null,
      correct_rate: evaluated.length > 0 ? Number(((correct / evaluated.length) * 100).toFixed(1)) : null,
      correct_question_count: correct,
      evaluated_question_count: evaluated.length,
      scored_question_count: scored.length,
      total_question_count: paper.questions.length,
      reportable_question_count: paper.questions.filter(isReportableQuestion).length,
    };
  });

  const status = QUESTION_STATUSES.filter((key) => key !== "unknown").map((key) => ({
    status: key,
    count: allQuestions.filter((q) => q.status === key).length,
  }));

  const errorMap = new Map<string, number>();
  for (const question of allQuestions) {
    if (question.status === "unknown" || question.status === "correct") continue;
    for (const tag of stringList(question.errorTags)) {
      const localized = localizeErrorTag(tag);
      errorMap.set(localized, (errorMap.get(localized) ?? 0) + 1);
    }
  }

  const knowledgeMap = new Map<string, { name: string; score: number; max: number; observed: number; observedMax: number; questions: number; questionNos: string[] }>();
  for (const question of allQuestions) {
    for (const point of stringList(question.knowledgePoints)) {
      const key = knowledgeKey(point);
      if (!key) continue;
      const item = knowledgeMap.get(key) ?? { name: point, score: 0, max: 0, observed: 0, observedMax: 0, questions: 0, questionNos: [] };
      item.questions += 1;
      const questionNo = String((question as { questionNo?: string }).questionNo ?? question.questionId ?? "").trim();
      if (questionNo) item.questionNos.push(questionNo);
      if (question.score !== null && question.maxScore !== null) {
        item.score += question.score;
        item.max += question.maxScore;
      }
      if (question.status !== "unknown") {
        item.observedMax += 1;
        if (question.status === "correct") item.observed += 1;
        if (question.status === "partial") item.observed += 0.5;
      }
      knowledgeMap.set(key, item);
    }
  }

  const knowledge = [...knowledgeMap.values()]
    .map((value) => ({
      name: value.name,
      mastery:
        value.max > 0
          ? Number(((value.score / value.max) * 100).toFixed(1))
          : value.observedMax > 0
            ? Number(((value.observed / value.observedMax) * 100).toFixed(1))
            : null,
      basis: value.max > 0 ? "score" : value.observedMax > 0 ? "status" : null,
      question_count: value.questions,
      question_nos: sortQuestionNos(value.questionNos),
    }))
    .sort((a, b) => {
      if (a.mastery === null && b.mastery === null) return b.question_count - a.question_count;
      if (a.mastery === null) return 1;
      if (b.mastery === null) return -1;
      return a.mastery - b.mastery || b.question_count - a.question_count;
    });

  // 能力方向聚合：把细碎知识点按关键字归入 6 个模块方向，供雷达图展示模块级掌握度。
  // 每个知识点只归第一个命中的方向；未命中任何方向时归入“综合应用”。
  const RADAR_DIRECTIONS: Array<{ name: string; keywords: string[] }> = [
    { name: "代数与函数", keywords: ["函数", "导数", "幂", "指数", "对数", "单调", "奇偶", "极值", "切线", "零点", "不等式", "二项式", "方程"] },
    { name: "三角与向量", keywords: ["三角", "正弦", "余弦", "向量", "解三角形"] },
    { name: "数列", keywords: ["数列", "等差", "等比", "递推", "求和", "归纳"] },
    { name: "概率与统计", keywords: ["概率", "统计", "分布", "期望", "方差", "回归", "相关", "正态", "抽样", "独立性", "卡方", "随机", "排列", "组合", "残差"] },
    { name: "几何", keywords: ["几何", "立体", "解析", "圆", "椭圆", "双曲线", "抛物线", "空间", "直线", "斜率", "距离", "夹角", "面积", "体积"] },
    { name: "集合与逻辑", keywords: ["集合", "逻辑", "量词", "命题", "充分", "必要", "交集", "并集", "补集"] },
  ];
  const directionMap = new Map<string, { score: number; max: number; questions: Set<string> }>();
  for (const question of allQuestions) {
    const hitDirections = new Set<string>();
    for (const point of stringList(question.knowledgePoints)) {
      const matched = RADAR_DIRECTIONS.find((direction) => direction.keywords.some((keyword) => point.includes(keyword)));
      hitDirections.add(matched ? matched.name : "综合应用");
    }
    for (const name of hitDirections) {
      const item = directionMap.get(name) ?? { score: 0, max: 0, questions: new Set<string>() };
      item.questions.add(String((question as { id?: string }).id ?? question.questionId));
      if (question.score !== null && question.maxScore !== null) {
        item.score += question.score;
        item.max += question.maxScore;
      }
      directionMap.set(name, item);
    }
  }
  const directions = [...directionMap.entries()]
    .map(([name, value]) => ({
      name,
      mastery: value.max > 0 ? Number(((value.score / value.max) * 100).toFixed(1)) : null,
      question_count: value.questions.size,
    }))
    .sort((a, b) => (b.mastery ?? -1) - (a.mastery ?? -1));

  // 按难度聚合：题数、得分率与正确率，用于看“失分集中在哪个难度档”
  const difficultyMap = new Map<string, { count: number; score: number; max: number; evaluated: number; correct: number; questionNos: string[] }>();
  for (const question of allQuestions) {
    const name = question.difficulty && DIFFICULTY_ORDER.includes(question.difficulty) ? question.difficulty : "未标注";
    const item = difficultyMap.get(name) ?? { count: 0, score: 0, max: 0, evaluated: 0, correct: 0, questionNos: [] };
    item.count += 1;
    const questionNo = String(question.questionNo ?? question.questionId ?? "").trim();
    if (questionNo) item.questionNos.push(questionNo);
    if (question.score !== null && question.maxScore !== null) {
      item.score += question.score;
      item.max += question.maxScore;
    }
    if (question.status !== "unknown") {
      item.evaluated += 1;
      if (question.status === "correct") item.correct += 1;
    }
    difficultyMap.set(name, item);
  }
  const difficulties = [...difficultyMap.entries()]
    .map(([name, value]) => ({
      name,
      question_count: value.count,
      score: Number(value.score.toFixed(1)),
      max_score: Number(value.max.toFixed(1)),
      score_rate: value.max > 0 ? Number(((value.score / value.max) * 100).toFixed(1)) : null,
      correct_rate: value.evaluated > 0 ? Number(((value.correct / value.evaluated) * 100).toFixed(1)) : null,
      question_nos: sortQuestionNos(value.questionNos),
    }))
    .sort((a, b) => {
      const order = (name: string) => (DIFFICULTY_ORDER.indexOf(name) === -1 ? 9 : DIFFICULTY_ORDER.indexOf(name));
      return order(a.name) - order(b.name);
    });

  // 班级口径（多人同卷/多卷都可用，每套卷＝一位学生或一场考试）：
  // 均分、中位、最高最低、及格率、优秀率与分数分档，供班级概览使用
  const perPaperScores = trend.map((item, index) => {
    const total = item.scanned_total_score ?? item.score;
    const max = item.declared_max_score ?? item.max_score ?? null;
    const rate = max !== null && max > 0 ? Number(((total / max) * 100).toFixed(1)) : null;
    return {
      paper_id: item.paper_id,
      student: (papers[index] as { studentNickname?: string | null })?.studentNickname ?? null,
      name: item.name,
      total: Number(total.toFixed(1)),
      max,
      rate,
    };
  });
  const scoreRates = perPaperScores.map((item) => item.rate).filter((rate): rate is number => rate !== null).sort((a, b) => a - b);
  const totals = perPaperScores.map((item) => item.total).sort((a, b) => a - b);
  const median = (values: number[]) => {
    if (values.length === 0) return null;
    const middle = Math.floor(values.length / 2);
    return values.length % 2 === 1 ? values[middle] : Number(((values[middle - 1] + values[middle]) / 2).toFixed(1));
  };
  const CLASS_BANDS = [
    { label: "优秀", range: "85% 以上", min: 85, max: null as number | null },
    { label: "良好", range: "75%–84%", min: 75, max: 85 },
    { label: "及格", range: "60%–74%", min: 60, max: 75 },
    { label: "待提升", range: "60% 以下", min: null as number | null, max: 60 },
  ];
  const classSummary = {
    count: perPaperScores.length,
    average: scoreRates.length > 0 ? Number((scoreRates.reduce((sum, rate) => sum + rate, 0) / scoreRates.length).toFixed(1)) : null,
    median: median(scoreRates),
    highest: scoreRates.length > 0 ? scoreRates[scoreRates.length - 1] : null,
    lowest: scoreRates.length > 0 ? scoreRates[0] : null,
    range: scoreRates.length > 0 ? Number((scoreRates[scoreRates.length - 1] - scoreRates[0]).toFixed(1)) : null,
    average_total: totals.length > 0 ? Number((totals.reduce((sum, value) => sum + value, 0) / totals.length).toFixed(1)) : null,
    median_total: median(totals),
    pass_rate: scoreRates.length > 0 ? Number(((scoreRates.filter((rate) => rate >= 60).length / scoreRates.length) * 100).toFixed(1)) : null,
    pass_count: scoreRates.filter((rate) => rate >= 60).length,
    excellent_rate: scoreRates.length > 0 ? Number(((scoreRates.filter((rate) => rate >= 85).length / scoreRates.length) * 100).toFixed(1)) : null,
    excellent_count: scoreRates.filter((rate) => rate >= 85).length,
    bands: CLASS_BANDS.map((band) => {
      const members = perPaperScores.filter((item) => item.rate !== null
        && (band.min === null || item.rate >= band.min)
        && (band.max === null || item.rate < band.max));
      return {
        label: band.label,
        range: band.range,
        count: members.length,
        rate: perPaperScores.length > 0 ? Number(((members.length / perPaperScores.length) * 100).toFixed(1)) : 0,
        students: members.map((item) => item.student ?? item.name),
      };
    }),
    papers: perPaperScores,
  };

  // 逐题班级掌握度：同一题号跨学生汇总，得到人均得分、得分率与判断
  const classQuestionMap = new Map<string, {
    question_no: string;
    text: string;
    knowledge: string[];
    students: number;
    score: number;
    max: number;
    correct: number;
    wrong: number;
    blank: number;
  }>();
  for (const paper of reportablePapers) {
    for (const question of paper.questions) {
      const questionNo = String(question.questionNo ?? question.questionId ?? "").trim();
      if (!questionNo) continue;
      const item = classQuestionMap.get(questionNo) ?? {
        question_no: questionNo,
        text: (question as { questionText?: string }).questionText ?? "",
        knowledge: stringList(question.knowledgePoints),
        students: 0,
        score: 0,
        max: 0,
        correct: 0,
        wrong: 0,
        blank: 0,
      };
      item.students += 1;
      if (question.score !== null && question.maxScore !== null) {
        item.score += question.score;
        item.max += question.maxScore;
      }
      if (question.status === "correct") item.correct += 1;
      else if (question.status === "blank") item.blank += 1;
      else if (question.status === "wrong" || question.status === "partial") item.wrong += 1;
      classQuestionMap.set(questionNo, item);
    }
  }
  const classQuestions = [...classQuestionMap.values()]
    .map((item) => {
      const scoreRate = item.max > 0 ? Number(((item.score / item.max) * 100).toFixed(1)) : null;
      const averageScore = item.students > 0 ? Number((item.score / item.students).toFixed(1)) : null;
      const averageMax = item.students > 0 ? Number((item.max / item.students).toFixed(1)) : null;
      const verdict = scoreRate === null ? "无数据" : scoreRate >= 85 ? "稳定" : scoreRate >= 75 ? "基本掌握" : scoreRate >= 60 ? "需巩固" : "优先突破";
      return {
        ...item,
        score_rate: scoreRate,
        average_score: averageScore,
        average_max: averageMax,
        wrong_rate: item.students > 0 ? Number((((item.wrong + item.blank) / item.students) * 100).toFixed(1)) : null,
        verdict,
      };
    })
    .sort((a, b) => {
      const an = (a.question_no.match(/\d+/g) ?? []).map(Number);
      const bn = (b.question_no.match(/\d+/g) ?? []).map(Number);
      for (let index = 0; index < Math.max(an.length, bn.length); index += 1) {
        const diff = (an[index] ?? 0) - (bn[index] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });

  const totalScore = trend.reduce((sum, item) => sum + item.score, 0);
  const totalMax = trend.reduce((sum, item) => sum + item.max_score, 0);
  const evaluatedQuestions = allQuestions;
  // 综合得分率按卷面口径计算：只纳入声明了满分的试卷，避免逐题合计与卷面满分混用
  const declaredTrend = trend.filter((item) => item.declared_max_score !== null);
  const declaredScoreTotal = declaredTrend.reduce((sum, item) => sum + (item.scanned_total_score ?? item.score), 0);
  const declaredMaxTotal = declaredTrend.reduce((sum, item) => sum + (item.declared_max_score ?? 0), 0);
  const overallScoreRate = declaredMaxTotal > 0
    ? Number(((declaredScoreTotal / declaredMaxTotal) * 100).toFixed(1))
    : totalMax > 0
      ? Number(((totalScore / totalMax) * 100).toFixed(1))
      : null;
  const scannedTotalScore = trend.some((item) => item.scanned_total_score !== null)
    ? Number(trend.reduce((sum, item) => sum + (item.scanned_total_score ?? 0), 0).toFixed(1))
    : null;

  return {
    overview: {
      paper_count: papers.length,
      // 卷面题数（含未纳入判定的题）
      question_count: totalQuestionCount,
      reportable_question_count: allQuestions.length,
      undecided_question_count: undecidedCount,
      evaluated_question_count: evaluatedQuestions.length,
      scored_question_count: trend.reduce((sum, item) => sum + item.scored_question_count, 0),
      review_count: papers.reduce((sum, paper) => sum + paper.questions.filter((question) => question.needsReview).length, 0),
      overall_score_rate: overallScoreRate,
      // 卷面总分（扫描读取）与卷面满分；逐题识别合计用 itemized_score 对账
      scanned_total_score: scannedTotalScore,
      declared_max_score: declaredMaxTotal > 0 ? Number(declaredMaxTotal.toFixed(1)) : null,
      itemized_score: Number(totalScore.toFixed(1)),
      overall_correct_rate:
        evaluatedQuestions.length > 0
          ? Number(((evaluatedQuestions.filter((question) => question.status === "correct").length / evaluatedQuestions.length) * 100).toFixed(1))
          : null,
      usable_data_rate: allQuestions.length > 0 ? 100 : 0,
    },
    trend,
    status,
    errors: [...errorMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    knowledge,
    directions,
    difficulties,
    class_summary: classSummary,
    class_questions: classQuestions,
  };
}
