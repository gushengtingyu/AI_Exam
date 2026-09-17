import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { db } from "@/lib/db";
import { getAiProvider, isVisionNode, nodeInstructionDigest, nodeModelFingerprint, type VisionAsset } from "@/lib/ai/provider";
import { ProviderRequestError, providerRetryDelay } from "@/lib/ai/provider-errors";
import {
  answerEvaluationSchema,
  answerKeySchema,
  scoringRuleSchema,
  bubbleDetectionSchema,
  documentClassificationSchema,
  errorAnalysisSchema,
  knowledgeMappingSchema,
  markReadingSchema,
  ocrLayoutSchema,
  pageQualitySchema,
  questionExtractionSchema,
  reportSpecSchema,
  scoreSummarySchema,
  semesterAnalysisSchema,
  type ExtractedQuestion,
} from "@/lib/schemas";
import { applyModeReport, buildModeEntries, resolveAnalysisMode, modeInstructions } from "@/lib/analysis-modes";
import { computeStatistics, isReportableQuestion, localizeErrorTag } from "@/lib/stats";
import { buildEvidenceLimitedReportSpec, enforceEvidenceBoundary, evaluatedQuestionCount } from "@/lib/report-quality";
import { readPrivateFile, writeProcessedFile } from "@/lib/storage";
import { REPORT_SCHEMA_VERSION, REPORT_TEMPLATE_VERSION, type AiNodeName } from "@/lib/constants";
import type { ZodType } from "zod";

const globalJobs = globalThis as unknown as { activeAnalysisJobs?: Map<string, { jobId: string; promise: Promise<void> }> };
const activeJobs = globalJobs.activeAnalysisJobs ?? new Map<string, { jobId: string; promise: Promise<void> }>();
if (!globalJobs.activeAnalysisJobs) globalJobs.activeAnalysisJobs = activeJobs;

class StaleJobError extends Error {
  constructor() {
    super("分析任务已被新的执行实例接管");
    this.name = "StaleJobError";
  }
}

type PipelineLease = {
  analysisId: string;
  jobId: string;
  runToken: string;
};

async function assertActiveRun(lease: PipelineLease) {
  const active = await db.job.findFirst({
    where: {
      id: lease.jobId,
      runToken: lease.runToken,
      status: { in: ["queued", "running"] },
      analysis: { activeRunToken: lease.runToken },
    },
    select: { id: true },
  });
  if (!active) throw new StaleJobError();
}

const mockDelay = () =>
  process.env.MOCK_MODE === "false"
    ? Promise.resolve()
    : new Promise((resolve) => setTimeout(resolve, Number(process.env.MOCK_STEP_DELAY_MS || 280)));

function chunks<T>(items: T[], size: number) {
  if (size <= 0) throw new Error("分块大小必须大于 0");
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  if (items.length === 0) return [];
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function questionKey(paperId: string, questionId: string) {
  return `${paperId}:${questionId}`;
}

/** 把题号统一成 "15-1" 形态：15(1)→15-1、19（2）（i）→19-2-i、q12→12、17_1→17-1，
 *  避免同题因格式差异重复入库 */
function normalizeQuestionId(questionId: string) {
  return questionId
    // 模型偶尔把内部的 cuid（形如 cmu3wqoli00m1cocgjsd3f8ua）当成题号或题号前缀返回，
    // 去掉它，避免报告里出现 "Qcmu3wqoli…" 这样的题号
    .replace(/c[a-z0-9]{18,}/gi, "-")
    .replace(/[（(]/g, "-")
    .replace(/[)）]/g, "")
    .replace(/[\s._]+/g, "-")
    .replace(/^q-?/i, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

/** 大题干号："15-1"→"15"、"19-2-i"→"19"；无小问的题返回原值 */
function parentQuestionId(questionId: string) {
  let current = questionId;
  for (let depth = 0; depth < 4; depth += 1) {
    const stripped = current.replace(/-(?:\d+|[ivx]+)$/i, "");
    if (stripped === current) break;
    current = stripped;
  }
  return current;
}

/** 由得分与满分推导状态：得分来自卷面标记时为唯一依据，不叠加主观判断 */
function statusFromScore(score: number, maxScore: number | null, hasAnswer: boolean) {
  if (maxScore !== null && maxScore > 0) {
    if (score >= maxScore - 0.001) return "correct" as const;
    if (score > 0) return "partial" as const;
    return hasAnswer ? ("wrong" as const) : ("blank" as const);
  }
  if (score > 0) return "partial" as const;
  return hasAnswer ? ("wrong" as const) : ("blank" as const);
}

/**
 * 小问重复计分兜底：
 * 情况 A——同一大题既有整题记录又有小问记录时，只保留带教师给分的一方；
 * 情况 B——同一大题下所有小问满分完全相同，说明是把大题满分抄进了每个小问，
 *          合并回一道整题记录（得分相加、满分为该大题满分），保证满分合计不虚高。
 */
function collapseDuplicateSubQuestions(questions: ExtractedQuestion[]) {
  const groups = new Map<string, ExtractedQuestion[]>();
  for (const question of questions) {
    const key = questionKey(question.paper_id, parentQuestionId(question.question_id));
    groups.set(key, [...(groups.get(key) ?? []), question]);
  }
  const result: ExtractedQuestion[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    const parentId = parentQuestionId(group[0].question_id);
    const parent = group.find((question) => question.question_id === parentId);
    if (parent) {
      const children = group.filter((question) => question !== parent);
      const childScored = children.some((child) => child.scoring_basis === "teacher_mark" && child.score !== null);
      const parentScored = parent.scoring_basis === "teacher_mark" || parent.score !== null;
      if (childScored && !parentScored) {
        result.push(...children);
      } else {
        result.push(parent);
      }
      continue;
    }
    const maxes = group.map((question) => question.max_score);
    const sharedMax = maxes.every((max) => max !== null && Math.abs(Number(max) - Number(maxes[0])) < 0.001);
    if (!sharedMax) {
      result.push(...group);
      continue;
    }
    const scores = group.map((question) => question.score).filter((score): score is number => typeof score === "number");
    const score = scores.length > 0 ? Number(scores.reduce((sum, value) => sum + value, 0).toFixed(1)) : null;
    const maxScore = group[0].max_score;
    const answers = [...new Set(group.map((question) => (question.student_answer ?? "").trim()).filter((answer) => answer && answer !== "unknown"))];
    const texts = [...new Set(group.map((question) => (question.question_text ?? "").trim()).filter(Boolean))];
    const teacherScored = group.some((question) => question.scoring_basis === "teacher_mark" && question.score !== null);
    const primary = group.find((question) => question.score !== null) ?? group[0];
    result.push({
      ...primary,
      question_id: parentId,
      question_no: parentId,
      question_text: texts.join("\n"),
      student_answer: answers.join("；") || primary.student_answer,
      score,
      max_score: maxScore,
      status: score === null ? primary.status : statusFromScore(score, maxScore, answers.length > 0),
      scoring_basis: score === null ? primary.scoring_basis : teacherScored ? "teacher_mark" : primary.scoring_basis,
      knowledge_points: [...new Set(group.flatMap((question) => question.knowledge_points ?? []))],
      error_tags: [...new Set(group.flatMap((question) => question.error_tags ?? []))],
      evidence: group.flatMap((question) => question.evidence),
      confidence: Math.max(...group.map((question) => question.confidence ?? 0)),
      needs_review: group.some((question) => question.needs_review),
    });
  }
  return result;
}

type ScoreSummaryMark = {
  question_no: string;
  score: number | null;
  verdict: "correct" | "wrong" | "partial" | "blank" | "unknown" | null;
  answer?: string | null;
};

/** 展开“12-14”这类连续题号 */
function expandQuestionNo(questionNo: string) {
  const match = questionNo.trim().match(/^(\d+)\s*[-–~至]\s*(\d+)$/);
  if (!match) return [questionNo.trim()];
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 30) return [questionNo.trim()];
  return Array.from({ length: end - start + 1 }, (_, index) => String(start + index));
}

/** 全卷读取的教师给分是分值口径的权威来源：给出分数或判定即视为已确认，不再要求人工复核 */
function applyScoreSummaryMarks(questions: ExtractedQuestion[], paperId: string, marks: ScoreSummaryMark[]) {
  const paperQuestions = questions.filter((question) => question.paper_id === paperId);
  const byId = new Map(paperQuestions.map((question) => [question.question_id, question]));
  const appliedKeys: string[] = [];
  for (const mark of marks) {
    for (const rawNo of expandQuestionNo(mark.question_no)) {
      const id = normalizeQuestionId(rawNo);
      if (!id) continue;
      let target = byId.get(id);
      if (!target) {
        // 大题得分记在小问上时，写入尚未得分的小问，避免丢失整题得分
        const parent = parentQuestionId(id);
        const children = paperQuestions.filter((question) => parentQuestionId(question.question_id) === parent && question.question_id !== parent);
        const pending = children.filter((child) => child.score === null);
        if (children.length > 0 && pending.length <= 1) target = pending[0] ?? children[0];
      }
      if (!target) continue;
      // 选择题（作答是选项字母）只采用老师的勾叉结论：整页读出来的数字往往是模型对涂卡
      // 字母的二次猜测（曾把没写分的选择题读成“得5分”），不作为得分依据
      const objective = /^[A-D]{1,4}$/.test((target.student_answer ?? "").trim().toUpperCase());
      const verdict = mark.verdict === "unknown" ? null : mark.verdict;
      if (objective) {
        if (!verdict) continue;
        if (verdict === "correct" && target.max_score !== null) target.score = target.max_score;
        else if (verdict === "wrong" || verdict === "blank") target.score = 0;
        else if (verdict === "partial") target.score = target.max_score !== null ? Number((target.max_score / 2).toFixed(1)) : null;
        target.status = verdict;
      } else if (mark.score !== null) {
        if (target.max_score !== null && mark.score > target.max_score + 0.001) continue;
        target.score = mark.score;
        const hasAnswer = Boolean((target.student_answer ?? "").trim()) && (target.student_answer ?? "").trim() !== "unknown";
        target.status = statusFromScore(mark.score, target.max_score ?? null, hasAnswer);
      } else if (verdict) {
        // 已经读到老师写明的分数（如“15:8分”）时，不再用勾叉改判，避免把 8 分改成满分
        if (target.score !== null) continue;
        target.status = verdict;
        if (target.max_score !== null && verdict === "correct") target.score = target.max_score;
        if (target.max_score !== null && (verdict === "wrong" || verdict === "blank")) target.score = 0;
      } else {
        continue;
      }
      // 手写题（填空/解答）顺带读到的作答可以采纳；选择题作答由涂卡专项读数决定，不在这里改
      const markedAnswer = (mark.answer ?? "").trim().toUpperCase();
      if (markedAnswer && !/^[A-D]{1,4}$/.test(markedAnswer)) target.student_answer = mark.answer!.trim();
      target.scoring_basis = "teacher_mark";
      target.confidence = Math.max(target.confidence ?? 0, 0.9);
      target.needs_review = false;
      appliedKeys.push(questionKey(target.paper_id, target.question_id));
    }
  }
  return appliedKeys;
}

/** 选项字母归一：去重、排序，大小写无关 */
function normalizeChoiceLetters(value: string) {
  return [...new Set(value.toUpperCase().replace(/[^A-D]/g, ""))].sort().join("");
}

type ObjectiveRule = {
  type: "single" | "multiple";
  from: number;
  to: number;
  score: number;
  partial: "none" | "flat" | "proportional";
  partial_score: number | null;
};

/**
 * 选择题按权威答案判定：与标准答案一致得满分；所选字母都在标准答案内（选对但不全）
 * 按卷面说明给部分分——说明写死分值就用该分值（如物理“选对但不全的得 3 分”），
 * 说明是按比例时用 满分 × 选对项数 / 正确项数（如数学三个正确项选中一个得 2 分）；
 * 含错误选项得 0 分。每张卷的规则不同，因此以卷首说明为准，缺规则时按比例兜底。
 */
function applyAnswerKeyScoring(
  questions: ExtractedQuestion[],
  keys: Array<{ paperId: string; answers: Array<{ question_no: string; answer: string }> }>,
  rulesByPaper: Map<string, ObjectiveRule[]> = new Map(),
) {
  const appliedKeys: string[] = [];
  for (const entry of keys) {
    const keyByNo = new Map(entry.answers.map((item) => [normalizeQuestionId(item.question_no), normalizeChoiceLetters(item.answer)]));
    const rules = rulesByPaper.get(entry.paperId) ?? [];
    for (const question of questions.filter((item) => item.paper_id === entry.paperId)) {
      const rawAnswer = (question.student_answer ?? "").trim().toUpperCase();
      if (!/^[A-D]{1,4}$/.test(rawAnswer)) continue;
      const questionNumber = Number(String(question.question_no).match(/\d+/)?.[0] ?? 0);
      const rule = rules.find((item) => questionNumber >= item.from && questionNumber <= item.to);
      // 卷面分值缺失时用评分说明里的分值补齐
      const maxScore = question.max_score ?? rule?.score ?? null;
      if (maxScore === null || maxScore <= 0) continue;
      const student = normalizeChoiceLetters(rawAnswer);
      const key = keyByNo.get(normalizeQuestionId(question.question_id)) ?? keyByNo.get(normalizeQuestionId(question.question_no));
      if (!student || !key) continue;
      if (student === key) {
        question.score = maxScore;
        question.status = "correct";
      } else if (rule?.partial === "none") {
        question.score = 0;
        question.status = "wrong";
      } else if ([...student].every((letter) => key.includes(letter))) {
        const partialScore = rule?.partial === "flat" && rule.partial_score !== null
          ? Math.min(rule.partial_score, maxScore)
          : maxScore * (student.length / key.length);
        question.score = Number(partialScore.toFixed(1));
        question.status = "partial";
      } else {
        question.score = 0;
        question.status = "wrong";
      }
      question.scoring_basis = "answer_key";
      question.confidence = Math.max(question.confidence ?? 0, 0.95);
      question.needs_review = false;
      appliedKeys.push(questionKey(question.paper_id, question.question_id));
    }
  }
  return appliedKeys;
}

/** 去掉 AI 可能附加的 paperId 前缀（形如 "cmxxx_q12" → "q12"） */
function stripPaperPrefix(paperId: string, questionId: string) {
  if (paperId && questionId.startsWith(paperId)) {
    return questionId.slice(paperId.length).replace(/^[-_]+/, "");
  }
  return questionId;
}

const QUESTION_STATUS_RANK: Record<string, number> = { correct: 5, wrong: 5, partial: 4, blank: 3, unknown: 0 };

/** 同题两份记录（试卷页的题干 + 答题卡页的作答判分）字段级合并，避免二选一丢信息 */
function mergeQuestionPair(a: ExtractedQuestion, b: ExtractedQuestion): ExtractedQuestion {
  const cleanText = (s: string | null | undefined) => (s ?? "").trim();
  const isMeaningful = (s: string | null | undefined) => {
    const t = cleanText(s);
    return t.length > 0 && t !== "unknown";
  };
  const pickText = (x: string, y: string) => (cleanText(x).length >= cleanText(y).length ? x : y);
  const pickAnswer = (x: string, y: string) => (isMeaningful(x) ? x : isMeaningful(y) ? y : x || y);
  const primary = (QUESTION_STATUS_RANK[a.status] ?? 0) >= (QUESTION_STATUS_RANK[b.status] ?? 0) ? a : b;
  const secondary = primary === a ? b : a;
  const evidence = [...a.evidence, ...b.evidence].filter((item, index, all) =>
    all.findIndex((other) => other.image_id === item.image_id
      && other.bbox.x === item.bbox.x && other.bbox.y === item.bbox.y
      && other.bbox.width === item.bbox.width && other.bbox.height === item.bbox.height) === index);
  return {
    ...primary,
    question_text: pickText(a.question_text, b.question_text),
    student_answer: pickAnswer(a.student_answer, b.student_answer),
    score: a.score ?? b.score,
    max_score: a.max_score ?? b.max_score,
    scoring_basis: primary.scoring_basis !== "unavailable" ? primary.scoring_basis : secondary.scoring_basis,
    knowledge_points: [...new Set([...(a.knowledge_points ?? []), ...(b.knowledge_points ?? [])])],
    error_tags: [...new Set([...(a.error_tags ?? []), ...(b.error_tags ?? [])])],
    evidence,
    confidence: Math.max(a.confidence ?? 0, b.confidence ?? 0),
    needs_review: primary.needs_review && secondary.needs_review,
  };
}

const nodeLabels: Record<AiNodeName, string> = {
  page_quality: "图片质量检测",
  document_classification: "页面分类",
  ocr_layout: "OCR 与版面解析",
  question_extraction: "逐题提取",
  bubble_detection: "选择题涂卡识别",
  score_summary: "卷面总分与得分核对",
  mark_reading: "红笔批改标记识别",
  answer_key_reading: "权威答案读取",
  scoring_rule_reading: "评分规则读取",
  answer_evaluation: "评分依据校验",
  knowledge_mapping: "知识点映射",
  error_analysis: "错误归因",
  semester_analysis: "学期分析",
  report_planning: "报告规划",
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function findEvaluationItems(raw: unknown) {
  let current = raw;
  for (let depth = 0; depth < 4; depth += 1) {
    if (Array.isArray(current)) return current;
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
        continue;
      } catch {
        return null;
      }
    }
    if (!current || typeof current !== "object") return null;

    const value = current as Record<string, unknown>;
    if ("status" in value && ("scoring_basis" in value || "rationale" in value || "score" in value)) return [value];
    const nested = ["evaluations", "evaluation", "answer_evaluation", "results", "items", "answers", "questions", "data", "output", "response", "result"]
      .map((key) => value[key])
      .find((candidate) => candidate !== undefined && candidate !== null);
    if (nested !== undefined) {
      current = nested;
      continue;
    }
    const candidates = Object.values(value).filter((candidate) =>
      Array.isArray(candidate) || Boolean(candidate && typeof candidate === "object"),
    );
    if (candidates.length !== 1) return null;
    current = candidates[0];
  }
  return null;
}

function normalizeNodeOutput(node: AiNodeName, raw: unknown, input: unknown) {
  if (node === "ocr_layout") {
    // DeepSeek 可能把 OCR 的像素坐标当 bbox 输出（>1），此处按图片尺寸强制归一化
    const images = input && typeof input === "object" && Array.isArray((input as { images?: unknown }).images)
      ? (input as { images: Array<{ id?: string; width?: number; height?: number }> }).images
      : [];
    const sizeById = new Map(images.map((image) => [image.id, { width: image.width, height: image.height }]));
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    const rawPages = raw && typeof raw === "object" && Array.isArray((raw as { pages?: unknown }).pages)
      ? (raw as { pages: Array<Record<string, unknown>> }).pages
      : [];
    if (rawPages.length === 0) return raw;
    return {
      pages: rawPages.map((page) => {
        const imageId = String(page.image_id ?? page.imageId ?? "");
        const size = sizeById.get(imageId);
        const blocks = Array.isArray(page.blocks) ? (page.blocks as Array<Record<string, unknown>>) : [];
        let maxX = 1, maxY = 1;
        if (size?.width && size?.height) { maxX = size.width; maxY = size.height; }
        else {
          // 没有尺寸信息时，从数据本身判断：若坐标明显是像素级(>2)，按最大值归一化
          for (const block of blocks) {
            const bb = block.bbox as { x?: number; y?: number; width?: number; height?: number } | undefined;
            if (!bb) continue;
            const bx = typeof bb.x === "number" ? bb.x : 0;
            const by = typeof bb.y === "number" ? bb.y : 0;
            const bw = typeof bb.width === "number" ? bb.width : 0;
            const bh = typeof bb.height === "number" ? bb.height : 0;
            if (bx > maxX) maxX = bx;
            if (by > maxY) maxY = by;
            if (bw > 1) maxX = Math.max(maxX, bx + bw);
            if (bh > 1) maxY = Math.max(maxY, by + bh);
          }
        }
        const normalizeBbox = (bb: { x?: number; y?: number; width?: number; height?: number } | undefined) => {
          if (!bb) return bb;
          const x = Number(bb.x ?? 0), y = Number(bb.y ?? 0);
          const w = Number(bb.width ?? 0), h = Number(bb.height ?? 0);
          // 已是 0~1 归一化则不动
          if (x <= 1 && y <= 1 && x + w <= 1.001 && y + h <= 1.001) return bb;
          return {
            x: clamp(x / maxX), y: clamp(y / maxY),
            width: clamp(w / maxX), height: clamp(h / maxY),
          };
        };
        return {
          ...page,
          image_id: imageId || String(page.page_num ?? 0),
          blocks: blocks.map((block) => ({ ...block, bbox: normalizeBbox(block.bbox as never) })),
        };
      }),
    };
  }
  if (node === "knowledge_mapping") {
    // AI 对无题干/识别不清的题可能给不出知识点（空数组），撞 schema min(1)。
    // 此处补"未分类"占位，避免单个题目拖垮整条管线。
    const rawMappings = raw && typeof raw === "object" && Array.isArray((raw as { mappings?: unknown }).mappings)
      ? (raw as { mappings: Array<Record<string, unknown>> }).mappings
      : null;
    if (!rawMappings) return raw;
    return {
      mappings: rawMappings.map((mapping) => {
        const points = Array.isArray(mapping.knowledge_points)
          ? (mapping.knowledge_points as unknown[]).map((p) => String(p)).filter((p) => p.trim().length > 0)
          : [];
        return {
          ...mapping,
          knowledge_points: points.length > 0 ? points : ["未分类"],
          confidence: typeof mapping.confidence === "number" ? mapping.confidence : 0.5,
        };
      }),
    };
  }
  if (node === "error_analysis") {
    // 每题一条记录（错误题含 3 道变式练习、正确题含一句要点评析）；
    // 此处裁剪空题干练习并保证字段类型，避免单题拖垮整条管线。
    const rawErrors = raw && typeof raw === "object" && Array.isArray((raw as { errors?: unknown }).errors)
      ? (raw as { errors: Array<Record<string, unknown>> }).errors
      : null;
    if (!rawErrors) return raw;
    return {
      errors: rawErrors.map((error) => {
        const list = Array.isArray(error.practice_questions)
          ? (error.practice_questions as Array<Record<string, unknown>>)
              .filter((item) => item && typeof item === "object" && String(item.question_text ?? "").trim().length > 0)
              .slice(0, 3)
          : [];
        return {
          ...error,
          explanation: typeof error.explanation === "string" ? error.explanation : "",
          error_tags: Array.isArray(error.error_tags) ? error.error_tags : [],
          confidence: typeof error.confidence === "number" ? error.confidence : 0.5,
          needs_review: typeof error.needs_review === "boolean" ? error.needs_review : true,
          practice_questions: list,
        };
      }),
    };
  }
  if (node !== "answer_evaluation") return raw;
  const evaluations = findEvaluationItems(raw);
  if (!evaluations) return raw;

  const sourceQuestions = input && typeof input === "object" && Array.isArray((input as { questions?: unknown }).questions)
    ? (input as { questions: Array<Record<string, unknown>> }).questions
    : [];
  const sourceById = new Map(sourceQuestions.map((question) => [
    questionKey(String(question.paper_id ?? ""), String(question.question_id ?? "")),
    question,
  ]));
  // 模型时常省略 paper_id（只给 question_id），甚至只给内容；用三层兜底回填：
  // 精确匹配 → question_id 匹配 → 按索引匹配（长度一致时）
  const sourceByQid = new Map(sourceQuestions.map((question) => [String(question.question_id ?? ""), question]));

  return {
    evaluations: evaluations.map((item, index) => {
      if (!item || typeof item !== "object") return item;
      const evaluation = item as Record<string, unknown>;
      const source = sourceById.get(questionKey(String(evaluation.paper_id ?? ""), String(evaluation.question_id ?? "")))
        ?? sourceByQid.get(String(evaluation.question_id ?? ""))
        ?? (evaluations.length === sourceQuestions.length ? sourceQuestions[index] : undefined)
        ?? (sourceQuestions.length === 1 ? sourceQuestions[0] : undefined);
      return {
        ...evaluation,
        paper_id: typeof evaluation.paper_id === "string" ? evaluation.paper_id : source?.paper_id,
        question_id: typeof evaluation.question_id === "string" ? evaluation.question_id : source?.question_id,
        student_answer: typeof evaluation.student_answer === "string"
          ? evaluation.student_answer
          : String(source?.student_answer ?? "unknown"),
        confidence: typeof evaluation.confidence === "number"
          ? evaluation.confidence
          : Math.min(Number(source?.confidence ?? 0.65), 0.65),
        needs_review: typeof evaluation.needs_review === "boolean" ? evaluation.needs_review : true,
        rationale: typeof evaluation.rationale === "string"
          ? evaluation.rationale
          : typeof evaluation.reason === "string"
            ? evaluation.reason
            : typeof evaluation.explanation === "string"
              ? evaluation.explanation
              : "已完成逐题判定。",
      };
    }),
  };
}

function conservativeEvaluationFallback(input: unknown) {
  const questions = input && typeof input === "object" && Array.isArray((input as { questions?: unknown }).questions)
    ? (input as { questions: Array<Record<string, unknown>> }).questions
    : [];
  return {
    evaluations: questions.map((question) => ({
      paper_id: String(question.paper_id ?? ""),
      question_id: String(question.question_id ?? ""),
      student_answer: String(question.student_answer ?? "unknown"),
      score: null,
      max_score: typeof question.max_score === "number" ? question.max_score : null,
      status: "unknown",
      scoring_basis: "unavailable",
      rationale: "远程评分结果无法解析，保留为待确认并提交人工复核。",
      confidence: Math.min(Number(question.confidence ?? 0.5), 0.5),
      needs_review: true,
    })),
  };
}

async function updateProgress(lease: PipelineLease, status: string, progress: number, currentStep: string) {
  await db.$transaction(async (tx) => {
    const claimed = await tx.job.updateMany({
      where: { id: lease.jobId, runToken: lease.runToken, status: { in: ["queued", "running"] } },
      data: { status: "running", progress, currentStep },
    });
    if (claimed.count !== 1) throw new StaleJobError();
    const updatedAnalysis = await tx.analysis.updateMany({
      where: { id: lease.analysisId, activeRunToken: lease.runToken },
      data: { status, progress, currentStep, failureReason: null },
    });
    if (updatedAnalysis.count !== 1) throw new StaleJobError();
  });
  await mockDelay();
}

async function updateRetryStep(lease: PipelineLease, currentStep: string) {
  await db.$transaction(async (tx) => {
    const claimed = await tx.job.updateMany({
      where: { id: lease.jobId, runToken: lease.runToken, status: "running" },
      data: { currentStep },
    });
    if (claimed.count !== 1) throw new StaleJobError();
    const updatedAnalysis = await tx.analysis.updateMany({ where: { id: lease.analysisId, activeRunToken: lease.runToken }, data: { currentStep } });
    if (updatedAnalysis.count !== 1) throw new StaleJobError();
  });
}

/** 递归收集输入中的所有图片 ID（视觉节点缓存键的稳定要素） */
function collectImageIds(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectImageIds(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, val] of Object.entries(value)) {
      if ((key === "image_id" || key === "id") && typeof val === "string") out.push(val);
      else if (key === "image_ids" && Array.isArray(val)) out.push(...val.map(String));
      else collectImageIds(val, out);
    }
  }
  return out;
}

async function runValidatedNode<T>(
  lease: PipelineLease,
  node: AiNodeName,
  input: unknown,
  schema: ZodType<T>,
  vision: VisionAsset[] = [],
  maxAttemptsOverride?: number,
) {
  const provider = getAiProvider();
  let maxAttempts = maxAttemptsOverride ?? boundedInteger(
    process.env.AI_NODE_MAX_ATTEMPTS,
    // 默认 3 次：OCR 版面解析偶发响应截断（宽幅合页答题卡文本量大），多给一次机会
    3,
    1,
    3,
  );
  // 节点级缓存：输入与指令均未变化的已成功调用直接复用（重跑时跳过 OCR/提取/判分等耗时节点）
  // 缓存键：视觉节点只看图片集 + 指令摘要（避免上游 AI 输出中的浮点值导致级联失效）；
  // 文本节点用完整输入（上游视觉命中缓存后，其输入天然稳定）
  const hashBasis = isVisionNode(node)
    ? JSON.stringify({ node, imageIds: [...new Set(collectImageIds(input))].sort() })
    : JSON.stringify(json(input));
  const inputHash = createHash("sha256")
    .update(hashBasis)
    .update(nodeInstructionDigest(node))
    .update(nodeModelFingerprint(node))
    .digest("hex");
  const cachedRun = await db.aiRun.findFirst({
    where: { analysisId: lease.analysisId, node, inputHash, status: "succeeded" },
    orderBy: { createdAt: "desc" },
    select: { outputJson: true },
  });
  if (cachedRun?.outputJson != null) {
    const cachedResult = schema.safeParse(normalizeNodeOutput(node, cachedRun.outputJson, input));
    if (cachedResult.success) {
      return cachedResult.data;
    }
  }
  let lastError = "节点返回不符合结构";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await assertActiveRun(lease);
    const startedAt = Date.now();
    let rawOutput: unknown;
    const run = await db.aiRun.create({
      data: { analysisId: lease.analysisId, node, status: "running", attempt, inputJson: json(input), inputHash },
    });
    const heartbeatMs = boundedInteger(process.env.AI_JOB_HEARTBEAT_MS, 30_000, 10_000, 60_000);
    const heartbeat = setInterval(() => {
      void db.job.updateMany({ where: { id: lease.jobId, runToken: lease.runToken, status: "running" }, data: { status: "running" } }).catch(() => undefined);
    }, heartbeatMs);
    heartbeat.unref();
    try {
      const activeJob = await db.job.findUnique({ where: { id: lease.jobId }, select: { runToken: true, status: true } });
      if (!activeJob || activeJob.runToken !== lease.runToken || !["queued", "running"].includes(activeJob.status)) throw new StaleJobError();
      rawOutput = await provider.runNode(node, input, schema, vision);
      const result = schema.safeParse(normalizeNodeOutput(node, rawOutput, input));
      if (!result.success) {
        const issues = result.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`);
        throw new Error(`JSON Schema 校验失败：${issues.join("；")}`);
      }
      await db.aiRun.update({
        where: { id: run.id },
        data: { status: "succeeded", outputJson: json(result.data), durationMs: Date.now() - startedAt },
      });
      return result.data;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "未知节点错误";
      await db.aiRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          error: lastError,
          outputJson: rawOutput === undefined ? undefined : json(rawOutput),
          durationMs: Date.now() - startedAt,
        },
      });
      if (error instanceof StaleJobError) throw error;
      let delayMs = attempt * 500;
      if (error instanceof ProviderRequestError) {
        const providerDelay = providerRetryDelay(error, attempt);
        if (providerDelay === null) throw error;
        delayMs = providerDelay;
        // Schema retries remain short; transient provider failures get their own budget.
        if (maxAttemptsOverride === undefined) {
          maxAttempts = Math.max(maxAttempts, boundedInteger(process.env.AI_PROVIDER_MAX_ATTEMPTS, 4, 1, 5));
        }
      }
      if (attempt < maxAttempts) {
        const retryStep = error instanceof ProviderRequestError
          ? `${nodeLabels[node]}服务暂时繁忙，${Math.ceil(delayMs / 1000)} 秒后重试 ${attempt + 1}/${maxAttempts}`
          : `${nodeLabels[node]}返回异常，正在重试 ${attempt + 1}/${maxAttempts}`;
        await updateRetryStep(lease, retryStep);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } finally {
      clearInterval(heartbeat);
    }
  }
  if (node === "answer_evaluation") {
    const fallback = schema.safeParse(conservativeEvaluationFallback(input));
    if (fallback.success) return fallback.data;
  }
  throw new Error(`${node} 连续 ${maxAttempts} 次失败：${lastError}`);
}

type InspectionImage = {
  id: string;
  paper_id: string;
  kind: string;
  page_order: number;
  quality_score: number;
};

function localPageQuality(images: InspectionImage[]) {
  return pageQualitySchema.parse({
    pages: images.map((image) => {
      const blurry = image.quality_score < 0.12;
      const acceptable = !blurry && image.quality_score < 0.22;
      return {
        image_id: image.id,
        quality: blurry ? "blurry" : acceptable ? "acceptable" : "good",
        sharpness: image.quality_score,
        rotation_degrees: 0,
        issues: blurry ? ["图片清晰度不足，建议重新上传"] : acceptable ? ["图片清晰度一般"] : [],
        needs_reupload: blurry,
      };
    }),
  });
}

function localDocumentClassification(images: InspectionImage[]) {
  return documentClassificationSchema.parse({
    pages: images.map((image) => ({
      image_id: image.id,
      document_type: image.kind === "answer_key" ? "answer_key" : "paper",
      paper_group: image.paper_id,
      page_no: image.page_order + 1,
      confidence: 0.99,
    })),
  });
}

async function preprocessImage(image: { id: string; storageKey: string; processedKey?: string | null }, lease: PipelineLease) {
  await assertActiveRun(lease);
  // 已处理过且结果文件仍存在：跳过重复预处理（重跑提速）
  if (image.processedKey) {
    try {
      await readPrivateFile(image.processedKey);
      return;
    } catch {
      // 处理文件缺失，走完整流程重新生成
    }
  }
  const source = await readPrivateFile(image.storageKey);
  const processed = await sharp(source)
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({ width: 2400, height: 3200, fit: "inside", withoutEnlargement: true })
    .normalise({ lower: 1, upper: 99 })
    .sharpen({ sigma: 0.7 })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  const probe = await sharp(processed)
    .greyscale()
    .resize({ width: 360, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let edgeSum = 0;
  let edgeCount = 0;
  const { width, height } = probe.info;
  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const index = y * width + x;
      edgeSum += Math.abs(probe.data[index] - probe.data[index - 1]);
      edgeSum += Math.abs(probe.data[index] - probe.data[index - width]);
      edgeCount += 2;
    }
  }
  const qualityScore = Math.min(1, edgeCount ? edgeSum / edgeCount / 18 : 0);
  const metadata = await sharp(processed).metadata();
  const processedKey = image.storageKey.replace(/\.[^.]+$/, "") + ".processed.jpg";
  await writeProcessedFile(processedKey, processed);
  await db.$transaction(async (tx) => {
    const active = await tx.job.findFirst({
      where: { id: lease.jobId, runToken: lease.runToken, status: { in: ["queued", "running"] }, analysis: { activeRunToken: lease.runToken } },
      select: { id: true },
    });
    if (!active) throw new StaleJobError();
    await tx.paperImage.update({
      where: { id: image.id },
      data: {
        processedKey,
        qualityScore,
        qualityStatus: qualityScore < 0.12 ? "blurry" : qualityScore < 0.22 ? "acceptable" : "good",
        width: metadata.width,
        height: metadata.height,
      },
    });
  });
}

type RedMarkRegion = { left: number; top: number; width: number; height: number };

/**
 * 定位红笔批改标记：在缩略图上按网格统计红色像素，聚成若干区域并映射回原图坐标。
 * 视觉接口会把整页缩到约 800px，写在小字旁的勾叉会糊掉；把每处红笔标记裁出来放大，
 * 才能可靠读出“对勾/叉/分数”。
 */
async function findRedMarkRegions(buffer: Buffer, maxRegions = 20): Promise<RedMarkRegion[]> {
  const thumbWidth = 480;
  const { data, info } = await sharp(buffer).resize({ width: thumbWidth }).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const native = await sharp(buffer).metadata();
  const nativeWidth = native.width ?? width;
  const nativeHeight = native.height ?? height;
  // 缩略图坐标 → 原图坐标
  const toNative = nativeWidth / width;
  // 网格按原图约 56px 一格：够细以区分相邻行，又能让同一处标记落在相邻格里
  const cellNative = 56;
  const cols = Math.max(1, Math.round(nativeWidth / cellNative));
  const cellWidth = width / cols;
  const rows = Math.max(1, Math.round(nativeHeight / cellNative));
  const cellHeight = height / rows;
  const hot = new Set<number>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const r = data[offset] ?? 0;
      const g = data[offset + 1] ?? 0;
      const b = data[offset + 2] ?? 0;
      // 红笔：红色明显高于绿蓝通道，且不是纸张阴影
      if (r > 110 && r - Math.max(g, b) > 42) {
        hot.add(Math.floor(y / cellHeight) * cols + Math.floor(x / cellWidth));
      }
    }
  }
  if (hot.size === 0) return [];
  // 相邻热格合并成区域（8 邻域）
  const visited = new Set<number>();
  const regions: RedMarkRegion[] = [];
  for (const start of hot) {
    if (visited.has(start)) continue;
    const queue = [start];
    visited.add(start);
    let minCol = cols, maxCol = -1, minRow = rows, maxRow = -1;
    while (queue.length > 0) {
      const cell = queue.pop()!;
      const col = cell % cols;
      const row = Math.floor(cell / cols);
      minCol = Math.min(minCol, col); maxCol = Math.max(maxCol, col);
      minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row);
      // 只做横向合并：同一处标记（含“12-14:0分”这类连续题号）连成一段，
      // 不同题的标记不会被纵向串成一片
      for (const nextCol of [col - 1, col + 1]) {
        if (nextCol < 0 || nextCol >= cols) continue;
        const next = row * cols + nextCol;
        if (hot.has(next) && !visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    const markLeft = Math.floor(minCol * cellWidth * toNative);
    const markTop = Math.floor(minRow * cellHeight * toNative);
    const markWidth = Math.ceil((maxCol - minCol + 1) * cellWidth * toNative);
    const markHeight = Math.ceil((maxRow - minRow + 1) * cellHeight * toNative);
    // 作答区通常在这处红笔标记的左侧，把裁切向左扩展成一条答题行带，
    // 让模型在同一张放大图里同时看清学生涂的选项和教师的勾叉
    const bandWidth = Math.min(nativeWidth, Math.min(560, Math.max(Math.round(markWidth * 5), 260)));
    const left = Math.max(0, Math.min(markLeft - (bandWidth - markWidth), nativeWidth - bandWidth));
    const top = Math.max(0, markTop - Math.round(markHeight * 0.5));
    regions.push({
      left,
      top,
      width: bandWidth,
      height: Math.min(nativeHeight - top, Math.min(180, Math.max(Math.round(markHeight * 2.2), 64))),
    });
  }
  // 按阅读顺序排列（先上后左），保证裁出来的放大图覆盖整页而不是挤在某一块
  return regions
    .filter((region) => region.width > 8 && region.height > 8)
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .slice(0, maxRegions);
}

/**
 * 把相邻的作答行合并成整块再裁图：一次给模型看连续几行（含题号 1-5、6-8 这样的分组），
 * 比把每行单独裁一张更不容易读串行，图也更少。
 */
function groupRedMarkRegions(regions: RedMarkRegion[], gapFactor = 0.6, minOverlap = 0.4) {
  const sorted = [...regions].sort((a, b) => a.top - b.top || a.left - b.left);
  const groups: RedMarkRegion[] = [];
  for (const region of sorted) {
    const last = groups[groups.length - 1];
    if (last) {
      const verticalGap = region.top - (last.top + last.height);
      const horizontalOverlap = Math.min(last.left + last.width, region.left + region.width) - Math.max(last.left, region.left);
      if (verticalGap <= Math.max(region.height, last.height) * gapFactor && horizontalOverlap > Math.min(last.width, region.width) * minOverlap) {
        const left = Math.min(last.left, region.left);
        const top = Math.min(last.top, region.top);
        const right = Math.max(last.left + last.width, region.left + region.width);
        const bottom = Math.max(last.top + last.height, region.top + region.height);
        groups[groups.length - 1] = { left, top, width: right - left, height: bottom - top };
        continue;
      }
    }
    groups.push({ ...region });
  }
  return groups;
}

/**
 * 宽幅扫描件（答题卡合页、A3 对开）整页缩放后涂卡方块与红笔批改会糊掉，
 * 因此附上分区放大图：整页图看结构，分区图看细节。分区由源图确定性生成，
 * 命中节点缓存时行为一致。
 */
async function buildSheetVisionAssets(images: Array<{ id: string; mimeType: string; storageKey: string; pageOrder: number }>) {
  const assets: VisionAsset[] = [];
  const imageMeta: Array<{ image_index: number; image_id: string; page_order: number; role: string }> = [];
  const push = (data: Buffer, mimeType: string, role: string, imageId: string, pageOrder: number) => {
    assets.push({ mimeType, data });
    imageMeta.push({ image_index: assets.length, image_id: imageId, page_order: pageOrder, role });
  };
  for (const image of images) {
    const raw = await readPrivateFile(image.storageKey);
    push(raw, image.mimeType, "整页", image.id, image.pageOrder);
    const meta = await sharp(raw).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const panels = height > 0 && width / height > 1.2 ? Math.min(3, Math.ceil(width / 900)) : 1;
    if (panels <= 1) continue;
    const panelWidth = Math.ceil(width / panels);
    const overlap = Math.floor(panelWidth * 0.06);
    for (let index = 0; index < panels; index += 1) {
      const left = Math.max(0, index * panelWidth - overlap);
      const right = Math.min(width, (index + 1) * panelWidth + overlap);
      const data = await sharp(raw).extract({ left, top: 0, width: right - left, height }).jpeg({ quality: 92 }).toBuffer();
      push(data, "image/jpeg", `分区放大${index + 1}`, image.id, image.pageOrder);
    }
  }
  return { assets, imageMeta, push };
}

async function loadVisionAssets(images: Array<{ processedKey: string | null; storageKey: string; mimeType: string }>) {
  return Promise.all(images.map(async (image) => {
    const key = image.processedKey || image.storageKey;
    return { mimeType: image.processedKey ? "image/jpeg" : image.mimeType, data: await readPrivateFile(key) } satisfies VisionAsset;
  }));
}

type ImageRecord = {
  id: string;
  processedKey: string | null;
  storageKey: string;
  mimeType: string;
};

type QuestionVisual = {
  question: ExtractedQuestion;
  asset: VisionAsset;
  redRatio: number;
};

function expandedEvidenceBox(bbox: { x: number; y: number; width: number; height: number }) {
  const centerX = bbox.x + bbox.width / 2;
  const centerY = bbox.y + bbox.height / 2;
  const width = Math.min(1, Math.max(bbox.width + 0.024, 0.48));
  const height = Math.min(1, Math.max(bbox.height + 0.024, 0.12));
  const x = Math.max(0, Math.min(1 - width, centerX - width / 2));
  const y = Math.max(0, Math.min(1 - height, centerY - height / 2));
  return { x, y, width, height };
}

async function buildQuestionVisual(
  question: ExtractedQuestion,
  imageById: Map<string, ImageRecord>,
  imageCache: Map<string, Promise<Buffer>>,
): Promise<QuestionVisual | null> {
  const evidence = question.evidence[0];
  if (!evidence) return null;
  const image = imageById.get(evidence.image_id);
  if (!image) return null;
  let sourcePromise = imageCache.get(image.id);
  if (!sourcePromise) {
    sourcePromise = readPrivateFile(image.processedKey || image.storageKey);
    imageCache.set(image.id, sourcePromise);
  }
  const source = await sourcePromise;
  const metadata = await sharp(source).metadata();
  if (!metadata.width || !metadata.height) return null;
  const relatedEvidence = question.evidence.filter((item) => item.image_id === evidence.image_id);
  const leftEdge = Math.min(...relatedEvidence.map((item) => item.bbox.x));
  const topEdge = Math.min(...relatedEvidence.map((item) => item.bbox.y));
  const rightEdge = Math.max(...relatedEvidence.map((item) => item.bbox.x + item.bbox.width));
  const bottomEdge = Math.max(...relatedEvidence.map((item) => item.bbox.y + item.bbox.height));
  const bbox = expandedEvidenceBox({
    x: leftEdge,
    y: topEdge,
    width: Math.min(1 - leftEdge, rightEdge - leftEdge),
    height: Math.min(1 - topEdge, bottomEdge - topEdge),
  });
  const crop = (
    box: { x: number; y: number; width: number; height: number },
    maxWidth: number,
    maxHeight: number,
    quality: number,
  ) => {
    const left = Math.max(0, Math.floor(box.x * metadata.width!));
    const top = Math.max(0, Math.floor(box.y * metadata.height!));
    const width = Math.max(1, Math.min(metadata.width! - left, Math.ceil(box.width * metadata.width!)));
    const height = Math.max(1, Math.min(metadata.height! - top, Math.ceil(box.height * metadata.height!)));
    return sharp(source)
      .extract({ left, top, width, height })
      .resize({ width: maxWidth, height: maxHeight, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  };
  const visualMaxWidth = boundedInteger(process.env.AI_QUESTION_IMAGE_MAX_WIDTH, 1_400, 800, 2_400);
  const visualMaxHeight = boundedInteger(process.env.AI_QUESTION_IMAGE_MAX_HEIGHT, 1_800, 1_000, 3_200);
  const [cropped, markCropped] = await Promise.all([
    crop(bbox, visualMaxWidth, visualMaxHeight, 84),
    crop(expandedEvidenceBox(evidence.bbox), 700, 900, 80),
  ]);
  const probe = await sharp(markCropped)
    .resize({ width: 500, withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let redPixels = 0;
  const pixelCount = probe.data.length / probe.info.channels;
  for (let index = 0; index < probe.data.length; index += probe.info.channels) {
    const red = probe.data[index];
    const green = probe.data[index + 1];
    const blue = probe.data[index + 2];
    if (red > 110 && red > green + 25 && red > blue + 25) redPixels += 1;
  }
  return {
    question,
    asset: { mimeType: "image/jpeg", data: cropped },
    redRatio: pixelCount > 0 ? redPixels / pixelCount : 0,
  };
}

type OcrEvidencePage = {
  image_id: string;
  blocks: Array<{ text: string; bbox: { x: number; y: number; width: number; height: number } }>;
};

function locateQuestionEvidence(questionNo: string, pages: OcrEvidencePage[], allowedImageIds: Set<string>) {
  const leadingNumber = questionNo.match(/\d{1,3}/)?.[0];
  if (!leadingNumber) return [];
  const questionHeader = new RegExp(`^\\s*(?:第\\s*)?${leadingNumber}\\s*(?:题|[.、．])`);
  const anyQuestionHeader = /^\s*(?:第\s*)?\d{1,3}\s*(?:题|[.、．])/;

  for (const page of pages) {
    if (!allowedImageIds.has(page.image_id)) continue;
    const start = page.blocks.findIndex((block) => questionHeader.test(block.text));
    if (start < 0) continue;
    let end = page.blocks.length;
    for (let index = start + 1; index < page.blocks.length; index += 1) {
      if (anyQuestionHeader.test(page.blocks[index].text)) {
        end = index;
        break;
      }
    }
    const region = page.blocks.slice(start, end).map((block) => block.bbox);
    if (region.length === 0) continue;
    const x = Math.max(0, Math.min(...region.map((bbox) => bbox.x)) - 0.005);
    const y = Math.max(0, Math.min(...region.map((bbox) => bbox.y)) - 0.005);
    const right = Math.min(1, Math.max(...region.map((bbox) => bbox.x + bbox.width)) + 0.005);
    const nextQuestionTop = end < page.blocks.length ? page.blocks[end].bbox.y : 0.985;
    const bottom = Math.min(1, Math.max(nextQuestionTop - 0.004, ...region.map((bbox) => bbox.y + bbox.height + 0.005)));
    if (right > x && bottom > y) {
      return [{ image_id: page.image_id, bbox: { x, y, width: right - x, height: bottom - y } }];
    }
  }
  return [];
}

function mergeExtractedQuestions(
  questions: ExtractedQuestion[],
  papers: Array<{ id: string; images: Array<{ id: string }> }>,
  ocrPages: OcrEvidencePage[],
) {
  const imageIdsByPaper = new Map(papers.map((paper) => [paper.id, new Set(paper.images.map((image) => image.id))]));
  const merged = new Map<string, ExtractedQuestion>();
  for (const question of questions) {
    const allowedImageIds = imageIdsByPaper.get(question.paper_id);
    if (!allowedImageIds || !question.question_id.trim() || !question.question_no.trim()) continue;
    const evidence = [
      ...question.evidence.filter((item) => allowedImageIds.has(item.image_id)),
      ...locateQuestionEvidence(question.question_no, ocrPages, allowedImageIds),
    ];
    const uniqueEvidence = [...new Map(
      evidence.map((item) => [
        `${item.image_id}:${item.bbox.x}:${item.bbox.y}:${item.bbox.width}:${item.bbox.height}`,
        item,
      ]),
    ).values()];
    const normalized = {
      ...question,
      question_id: normalizeQuestionId(stripPaperPrefix(question.paper_id, question.question_id)),
      // 题号同样清理 cuid 形态的杂质，报告里按题号展示
      question_no: normalizeQuestionId(question.question_no) || normalizeQuestionId(question.question_id),
      evidence: uniqueEvidence,
    };
    // 题号里认不出任何数字的条目无法与卷面对应（多为模型返回的 id 残渣），直接丢弃
    if (!normalized.question_id || !/\d/.test(normalized.question_no)) {
      console.error(`[extract] 丢弃无法识别题号的条目：no=${question.question_no} id=${question.question_id}`);
      continue;
    }
    const key = questionKey(question.paper_id, normalized.question_id);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, normalized);
    } else {
      // 同题多源（试卷页/答题卡页）字段级合并：题干取更长、作答取有效、判分取更可信
      merged.set(key, mergeQuestionPair(existing, normalized));
    }
  }
  if (questions.length > 0 && merged.size === 0) throw new Error("题目提取结果与当前分析任务不匹配");
  return collapseDuplicateSubQuestions([...merged.values()]);
}

function completeEvaluationSchema(questions: ExtractedQuestion[]) {
  const expected = new Set(questions.map((question) => `${question.paper_id}:${question.question_id}`));
  return answerEvaluationSchema.transform((value) => ({
    evaluations: value.evaluations.map((item) => {
      const rationale = item.rationale;
      const wrongSignals = ["判定为错误", "学生答案错误", "学生作答错误", "学生答案不正确", "学生作答不正确", "与正确结果不符"];
      const correctSignals = ["判定为正确", "学生答案正确", "学生作答正确", "与正确结果一致", "status应为correct", "更正为correct"];
      const lastWrong = Math.max(-1, ...wrongSignals.map((signal) => rationale.lastIndexOf(signal)));
      const lastCorrect = Math.max(-1, ...correctSignals.map((signal) => rationale.lastIndexOf(signal)));
      const conflict = lastWrong >= 0 && lastCorrect >= 0;
      const normalizedStatus = lastWrong > lastCorrect
        ? "wrong"
        : lastCorrect > lastWrong
          ? "correct"
          : item.status;
      if (!conflict && normalizedStatus === item.status) return item;
      return {
        ...item,
        status: normalizedStatus,
        confidence: Math.min(item.confidence, 0.8),
        needs_review: true,
      };
    }),
  })).superRefine((value, context) => {
    const seen = new Set<string>();
    for (const item of value.evaluations) {
      const key = `${item.paper_id}:${item.question_id}`;
      if (!expected.has(key)) context.addIssue({ code: "custom", message: `返回了未请求的题目 ${key}` });
      if (seen.has(key)) context.addIssue({ code: "custom", message: `题目 ${key} 被重复返回` });
      seen.add(key);
    }
    for (const key of expected) {
      if (!seen.has(key)) context.addIssue({ code: "custom", message: `遗漏题目 ${key}` });
    }
  });
}

async function performPipeline(lease: PipelineLease) {
  try {
    await db.$transaction(async (tx) => {
      const claimed = await tx.job.updateMany({
        where: { id: lease.jobId, runToken: lease.runToken, status: "queued" },
        data: { status: "running", startedAt: new Date() },
      });
      if (claimed.count !== 1) throw new StaleJobError();
    });
    await updateProgress(lease, "preprocessing", 10, "图片自动旋转、增强与清晰度检测");
    let analysis = await db.analysis.findUniqueOrThrow({
      where: { id: lease.analysisId },
      include: { papers: { orderBy: { paperOrder: "asc" }, include: { images: { orderBy: { pageOrder: "asc" } } } } },
    });
    const originalImages = analysis.papers.flatMap((paper) => paper.images);
    // 多人同卷：试卷页与权威答案只上传一份，标记 shared，每套作答都要用到
    const sharedImages = originalImages.filter((image) => image.shared);
    const imagesForPaper = (paper: typeof analysis.papers[number]) => [
      ...paper.images,
      ...sharedImages.filter((shared) => !paper.images.some((image) => image.id === shared.id)),
    ];
    const preprocessConcurrency = boundedInteger(
      process.env.IMAGE_PREPROCESS_CONCURRENCY,
      process.env.NODE_ENV === "production" ? 1 : 2,
      1,
      3,
    );
    await mapWithConcurrency(originalImages, preprocessConcurrency, (image) => preprocessImage(image, lease));

    analysis = await db.analysis.findUniqueOrThrow({
      where: { id: lease.analysisId },
      include: { papers: { orderBy: { paperOrder: "asc" }, include: { images: { orderBy: { pageOrder: "asc" } } } } },
    });
    const images = analysis.papers.flatMap((paper) =>
      paper.images.map((image) => ({
        id: image.id,
        paper_id: paper.id,
        kind: image.kind,
        page_order: image.pageOrder,
        quality_score: image.qualityScore ?? 0,
        width: image.width,
        height: image.height,
      })),
    );
    const imageRecords = analysis.papers.flatMap((paper) => paper.images);
    const pageConcurrency = boundedInteger(process.env.AI_PAGE_CONCURRENCY, 2, 1, 3);
    const inspectionNodeConcurrency = boundedInteger(
      process.env.AI_INSPECTION_NODE_CONCURRENCY,
      process.env.NODE_ENV === "production" ? 1 : 2,
      1,
      2,
    );
    await updateProgress(lease, "preprocessing", 18, "图像质量与页面分类");
    const inspectionBatches = await mapWithConcurrency(chunks(images, 6), pageConcurrency, async (imageChunk) => {
      const ids = new Set(imageChunk.map((image) => image.id));
      const batchVision = await loadVisionAssets(imageRecords.filter((image) => ids.has(image.id)));
      const inspectQuality = () =>
        runValidatedNode(lease, "page_quality", { images: imageChunk }, pageQualitySchema, batchVision, 1)
          .catch((error) => { if (error instanceof StaleJobError) throw error; return localPageQuality(imageChunk); });
      const classifyDocument = () =>
        runValidatedNode(
          lease,
          "document_classification",
          { images: imageChunk, papers: analysis.papers.map((paper) => ({ id: paper.id, name: paper.name })) },
          documentClassificationSchema,
          batchVision,
          1,
        ).catch((error) => { if (error instanceof StaleJobError) throw error; return localDocumentClassification(imageChunk); });
      const [qualityResult, classificationResult] = inspectionNodeConcurrency === 1
        ? [await inspectQuality(), await classifyDocument()]
        : await Promise.all([inspectQuality(), classifyDocument()]);
      return { quality: qualityResult.pages, classification: classificationResult.pages };
    });
    const quality = { pages: inspectionBatches.flatMap((batch) => batch.quality) };
    const classification = { pages: inspectionBatches.flatMap((batch) => batch.classification) };
    await db.$transaction(async (tx) => {
      const active = await tx.job.findFirst({
        where: { id: lease.jobId, runToken: lease.runToken, status: "running", analysis: { activeRunToken: lease.runToken } },
        select: { id: true },
      });
      if (!active) throw new StaleJobError();
      for (const page of quality.pages) {
        await tx.paperImage.updateMany({
          where: { id: page.image_id },
          data: { qualityStatus: page.quality, qualityScore: page.sharpness },
        });
      }
      for (const page of classification.pages) {
        await tx.paperImage.updateMany({ where: { id: page.image_id }, data: { classification: page.document_type } });
      }
    });

    await updateProgress(lease, "ocr", 38, "OCR 与版面结构解析");
    // OCR models commonly accept one document image per request; page-level calls
    // also keep bounding-box evidence unambiguous and individually retryable.
    const ocrBatches = await mapWithConcurrency(chunks(images, 1), pageConcurrency, async (imageChunk) => {
      const ids = new Set(imageChunk.map((image) => image.id));
      const batchVision = await loadVisionAssets(imageRecords.filter((image) => ids.has(image.id)));
      const result = await runValidatedNode(
        lease,
        "ocr_layout",
        { images: imageChunk, classification: { pages: classification.pages.filter((page) => ids.has(page.image_id)) } },
        ocrLayoutSchema,
        batchVision,
      );
      return result.pages;
    });
    const ocr = { pages: ocrBatches.flat() };

    // 上传通道错位检测：权威答案通道里若混进了作答页（卷面出现“答题卡/考号/总分”等字样），
    // 既不能当答案册用（否则会拿学生答案当标准答案），也要在报告里提醒用户改传通道
    const ocrTextById = new Map(ocr.pages.map((page) => [page.image_id, page.text ?? ""]));
    const studentCardTextPattern = /答题卡|考号|准考证|总分|姓名[:：]/;
    const misplacedKeyImages = imageRecords.filter(
      (image) => image.kind === "answer_key" && studentCardTextPattern.test(ocrTextById.get(image.id) ?? ""),
    );
    const misplacedKeyImageIds = new Set(misplacedKeyImages.map((image) => image.id));
    if (misplacedKeyImages.length > 0) {
      console.error(`[channel] 权威答案通道里有 ${misplacedKeyImages.length} 张疑似作答页：${misplacedKeyImages.map((image) => image.fileName).join("、")}`);
    }

    await updateProgress(lease, "extracting", 51, "逐题提取题干、作答、批注与得分");
    const paperInput = analysis.papers.map((paper, order) => ({
      id: paper.id,
      name: paper.name,
      order,
      image_ids: imagesForPaper(paper).filter((i) => i.kind === "paper").map((i) => i.id),
      // 答案页（answer_key）只用于判分参照，不参与逐题提取，避免答案页上的题目被重复提取
      source_image_ids: imagesForPaper(paper).filter((i) => i.kind !== "answer_key").map((i) => i.id),
      has_answer_key: imagesForPaper(paper).some((i) => i.kind === "answer_key"),
    }));
    const extractionPageBatchSize = boundedInteger(process.env.AI_EXTRACTION_PAGE_BATCH_SIZE, 2, 1, 4);
    const extractionWork = paperInput.flatMap((paper) =>
      chunks(paper.source_image_ids, extractionPageBatchSize).map((imageIds, chunkIndex) => ({ paper, imageIds, chunkIndex })),
    );
    const extractionBatches = await mapWithConcurrency(extractionWork, pageConcurrency, async ({ paper, imageIds, chunkIndex }) => {
      const ids = new Set(imageIds);
      const paperVision = await loadVisionAssets(imageRecords.filter((image) => ids.has(image.id)));
      const paperSummary = {
        id: paper.id,
        name: paper.name,
        order: paper.order,
        image_ids: paper.image_ids,
        has_answer_key: paper.has_answer_key,
      };
      const result = await runValidatedNode(
        lease,
        "question_extraction",
        {
          subject: analysis.subject,
          papers: [{ ...paperSummary, image_ids: paper.image_ids.filter((id) => ids.has(id)) }],
          page_scope: { chunk_index: chunkIndex, image_ids: imageIds },
          ocr: { pages: ocr.pages.filter((page) => ids.has(page.image_id)) },
        },
        questionExtractionSchema,
        paperVision,
      );
      return result.questions;
    });
    const extractedQuestions = mergeExtractedQuestions(extractionBatches.flat(), analysis.papers, ocr.pages);

    // 涂卡补录：复合提取任务容易漏掉选择题涂卡，用专项识别补齐学生作答
    await updateProgress(lease, "extracting", 58, "选择题涂卡识别");
    const sheetImages = imageRecords.filter((image) => image.kind === "paper");
    const bubbleResults = await mapWithConcurrency(sheetImages, pageConcurrency, async (image) => {
      try {
        // 涂卡识别对画质敏感：整页缩放后单个涂卡方块只剩几个像素，必须按作答行裁出来放大。
        // 作答行位置由红笔批改标记定位（同一行内），没有批改标记的页面则退回整页图。
        const raw = await readPrivateFile(image.storageKey);
        const regions = groupRedMarkRegions(await findRedMarkRegions(raw).catch(() => [] as RedMarkRegion[]), 2.5, 0.3);
        const assets: VisionAsset[] = [];
        const imageMeta: Array<{ image_index: number; image_id: string; page_order: number; role: string }> = [];
        for (const region of regions.slice(0, 15)) {
          const data = await sharp(raw).extract(region)
            .resize({ width: Math.min(1400, Math.max(region.width * 3, 700)) })
            .jpeg({ quality: 94 })
            .toBuffer();
          assets.push({ mimeType: "image/jpeg", data });
          imageMeta.push({ image_index: assets.length, image_id: image.id, page_order: image.pageOrder, role: "答题行放大" });
        }
        if (assets.length === 0) {
          assets.push({ mimeType: image.mimeType, data: raw });
          imageMeta.push({ image_index: 1, image_id: image.id, page_order: image.pageOrder, role: "整页" });
        }
        const result = await runValidatedNode(
          lease,
          "bubble_detection",
          { image_id: image.id, images: imageMeta },
          bubbleDetectionSchema,
          assets,
          1,
        );
        return result.answers;
      } catch {
        return [] as Array<{ question_no: string; choice: string | null }>;
      }
    });
    const bubbleByNo = new Map<string, string>();
    for (const answers of bubbleResults) {
      for (const item of answers) {
        if (!item.choice || !item.choice.trim()) continue;
        const key = normalizeQuestionId(item.question_no);
        if (key && !bubbleByNo.has(key)) bubbleByNo.set(key, item.choice.trim().toUpperCase());
      }
    }
    // 涂卡节点按作答行放大图逐行读取，是选择题作答的专项读数：以它为准覆盖其它来源。
    // （整页缩放后单个方块只剩几个像素，逐题裁剪图又常常裁到题干页而非作答页，
    // 只有按行放大后的读数与实卷一致。）
    let bubbleApplied = 0;
    for (const question of extractedQuestions) {
      const choice = bubbleByNo.get(normalizeQuestionId(question.question_id))
        ?? bubbleByNo.get(normalizeQuestionId(question.question_no));
      if (!choice) continue;
      if ((question.student_answer ?? "").trim().toUpperCase() === choice) continue;
      question.student_answer = choice;
      bubbleApplied += 1;
    }
    if (bubbleApplied > 0) {
      console.error(`[bubble] 涂卡结果应用 ${bubbleApplied} 题作答`);
    }
    // 输入稳定化：按 question_id 排序。上游并发/合并的顺序抖动会让下游输入 hash 变化、
    // 缓存全部失效；统一排序后，重跑时可稳定命中节点缓存。
    extractedQuestions.sort((a, b) => a.question_id.localeCompare(b.question_id, "zh-CN", { numeric: true }));
    const extraction = { questions: extractedQuestions };

    await db.$transaction(async (tx) => {
      const active = await tx.job.findFirst({
        where: { id: lease.jobId, runToken: lease.runToken, status: "running", analysis: { activeRunToken: lease.runToken } },
        select: { id: true },
      });
      if (!active) throw new StaleJobError();
      for (const paper of analysis.papers) {
        const currentQuestionIds = extraction.questions
          .filter((question) => question.paper_id === paper.id)
          .map((question) => question.question_id);
        const where = currentQuestionIds.length > 0
          ? { paperId: paper.id, questionId: { notIn: currentQuestionIds } }
          : { paperId: paper.id };
        await tx.question.deleteMany({ where });
      }

      for (const question of extraction.questions) {
        const fields = {
          questionNo: question.question_no,
          questionText: question.question_text,
          studentAnswer: question.student_answer,
          score: question.score,
          maxScore: question.max_score,
          status: question.status,
          knowledgePoints: json(question.knowledge_points),
          errorTags: json(question.error_tags.map(localizeErrorTag)),
          errorAnalysis: null,
          aiPracticeQuestions: json([]),
          evidence: json(question.evidence),
          confidence: question.confidence,
          needsReview: question.needs_review,
          scoringBasis: question.scoring_basis,
          difficulty: question.difficulty ?? null,
        };
        await tx.question.upsert({
          where: { uq_question_paper_external: { paperId: question.paper_id, questionId: question.question_id } },
          create: { paperId: question.paper_id, questionId: question.question_id, ...fields },
          update: { ...fields, version: { increment: 1 } },
        });
      }
    });

    await updateProgress(lease, "reviewing", 63, "评分依据校验与低置信度标记");
    const questionChunkSize = boundedInteger(process.env.AI_QUESTION_CHUNK_SIZE, 30, 10, 50);
    const textConcurrency = boundedInteger(process.env.AI_TEXT_CONCURRENCY, 2, 1, 4);
    const hasAnswerKey = analysis.papers.some((paper) => paper.images.some((image) => image.kind === "answer_key"));
    const imageById = new Map(imageRecords.map((image) => [image.id, image]));
    const imageCache = new Map<string, Promise<Buffer>>();
    const visuals = (await mapWithConcurrency(extraction.questions, preprocessConcurrency, (question) =>
      buildQuestionVisual(question, imageById, imageCache),
    )).filter((visual): visual is QuestionVisual => visual !== null);
    // Resolved promises retain the full processed pages; cropped question images
    // are sufficient from this point onward.
    imageCache.clear();
    const visualByQuestion = new Map(visuals.map((visual) => [
      questionKey(visual.question.paper_id, visual.question.question_id),
      visual,
    ]));
    const answerKeyOcr = hasAnswerKey
      ? ocr.pages
          .filter((page) => classification.pages.some((item) => item.image_id === page.image_id && item.document_type === "answer_key"))
          .map((page) => ({ image_id: page.image_id, text: page.text }))
      : [];
    const configuredThreshold = Number(process.env.TEACHER_MARK_RED_PIXEL_RATIO);
    const redThreshold = Number.isFinite(configuredThreshold)
      ? Math.min(0.01, Math.max(0.00005, configuredThreshold))
      : 0.0002;
    const markedVisuals = visuals.filter((visual) => visual.redRatio >= redThreshold);
    const markBatchSize = boundedInteger(process.env.AI_TEACHER_MARK_BATCH_SIZE, 1, 1, 8);
    const teacherMarkBatches = await mapWithConcurrency(
      chunks(markedVisuals, markBatchSize),
      textConcurrency,
      async (batch) => runValidatedNode(
        lease,
        "answer_evaluation",
        {
          evaluation_mode: "teacher_mark_detection",
          visual_order: batch.map((visual, index) => ({
            image_index: index + 1,
            paper_id: visual.question.paper_id,
            question_id: visual.question.question_id,
            red_mark_signal: Number(visual.redRatio.toFixed(6)),
          })),
          questions: batch.map((visual) => visual.question),
          instruction: "只判断局部图中是否有明确教师红笔结论。红勾为 correct，红叉为 wrong，明确半对或扣分为 partial。红色批改线即使延伸到相邻区域，只要在本题答案处形成明确勾叉也应采用；无法确认时返回 unknown/unavailable，不要解题。",
        },
        completeEvaluationSchema(batch.map((visual) => visual.question)),
        batch.map((visual) => visual.asset),
        1,
      ),
    );
    const teacherDecisionMap = new Map(
      teacherMarkBatches
        .flatMap((batch) => batch.evaluations)
        .filter((item) => item.scoring_basis === "teacher_mark" && item.status !== "unknown")
        .map((item) => [questionKey(item.paper_id, item.question_id), item]),
    );
    const questionsToEvaluate = extraction.questions.filter(
      (question) => !teacherDecisionMap.has(questionKey(question.paper_id, question.question_id)),
    );
    const evaluationBatchSize = boundedInteger(process.env.AI_EVALUATION_VISUAL_BATCH_SIZE, 1, 1, 8);
    const modelEvaluationBatches = await mapWithConcurrency(
      chunks(questionsToEvaluate, evaluationBatchSize),
      textConcurrency,
      async (questions) => {
        const batchVisuals = questions
          .map((question) => visualByQuestion.get(questionKey(question.paper_id, question.question_id)))
          .filter((visual): visual is QuestionVisual => visual !== undefined);
        return runValidatedNode(
          lease,
          "answer_evaluation",
          {
            subject: analysis.subject,
            grade: analysis.grade,
            evaluation_mode: "full_evaluation",
            has_answer_key: hasAnswerKey,
            answer_key_ocr: answerKeyOcr,
            visual_order: batchVisuals.map((visual, index) => ({
              image_index: index + 1,
              paper_id: visual.question.paper_id,
              question_id: visual.question.question_id,
              red_mark_signal: Number(visual.redRatio.toFixed(6)),
            })),
            questions,
            instruction: "逐题先重新转写图片中的真实圈选或手写答案，输入 student_answer 仅作参考。若图中有明确红勾、红叉、扣分或批语，优先采用教师判定；否则独立解题并比较。客观题和填空题判 correct/wrong/blank，主观题按每个小问的关键步骤判 correct/partial/wrong/blank。各小问独立判断，不因上一小问错误而否定本小问的正确答案。无评分标准时不生成具体分数；只有题目或答案确实无法辨认时才用 unknown。最终 status 必须与 rationale 的最后结论一致。",
          },
          completeEvaluationSchema(questions),
          batchVisuals.map((visual) => visual.asset),
          1,
        );
      },
    );
    let evaluation = completeEvaluationSchema(extraction.questions).parse({
      evaluations: [
        ...teacherDecisionMap.values(),
        ...modelEvaluationBatches.flatMap((batch) => batch.evaluations),
      ],
    });
    // 判分覆盖兜底：模型偶尔漏返部分题，对“有作答但未获判定”的题自动补一轮判分
    {
      const evaluatedKeys = new Set(evaluation.evaluations.map((item) => questionKey(item.paper_id, item.question_id)));
      const missed = extraction.questions.filter((question) => {
        const answer = (question.student_answer ?? "").trim();
        return !evaluatedKeys.has(questionKey(question.paper_id, question.question_id))
          && answer.length > 0 && answer !== "unknown" && question.status === "unknown";
      });
      if (missed.length > 0) {
        const retried = await mapWithConcurrency(chunks(missed, 2), textConcurrency, async (batch) =>
          runValidatedNode(
            lease,
            "answer_evaluation",
            {
              evaluation_mode: "full_evaluation",
              has_answer_key: hasAnswerKey,
              questions: batch,
              instruction: "对给出的每道题逐一判定并给出得分，不得遗漏任何一题；输入中已含学生作答，教师批改优先，否则独立解题判断。",
            },
            completeEvaluationSchema(batch),
            [],
            2,
          ).catch((error) => {
            console.error(`[补判] 批次失败: ${error instanceof Error ? error.message : String(error)}`);
            return null;
          }),
        );
        const extra = retried
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .flatMap((item) => item.evaluations);
        if (extra.length > 0) {
          evaluation = completeEvaluationSchema(extraction.questions).parse({
            evaluations: [...evaluation.evaluations, ...extra],
          });
          console.error(`[补判] 模型漏判 ${missed.length} 题，补判收回 ${extra.length} 题`);
        }
      }
    }
    // 涂卡读数是选择题作答的专项结果：判分环节不得用题干页裁图猜出来的字母覆盖它，
    // 但要把涂卡值作为判分输入，让判分模型据此与权威答案比对
    const bubbleAnswerByKey = new Map<string, string>();
    for (const question of extraction.questions) {
      const choice = bubbleByNo.get(normalizeQuestionId(question.question_id))
        ?? bubbleByNo.get(normalizeQuestionId(question.question_no));
      if (choice) bubbleAnswerByKey.set(questionKey(question.paper_id, question.question_id), choice);
    }
    if (evaluation.evaluations.length > 0) {
      await db.$transaction(async (tx) => {
        const active = await tx.job.findFirst({
          where: { id: lease.jobId, runToken: lease.runToken, status: "running", analysis: { activeRunToken: lease.runToken } },
          select: { id: true },
        });
        if (!active) throw new StaleJobError();
        for (const item of evaluation.evaluations) {
          await tx.question.updateMany({
            where: { paperId: item.paper_id, questionId: item.question_id },
            data: {
              // 选择题作答以涂卡专项读数为准；判分模型看不到作答页时会照着标准答案猜字母
              studentAnswer: bubbleAnswerByKey.has(questionKey(item.paper_id, item.question_id))
                ? undefined
                : item.student_answer,
              // 判分未给出的分值不覆盖提取阶段已读到的红笔分值（undefined = 不更新该字段）
              score: item.score ?? undefined,
              maxScore: item.max_score ?? undefined,
              status: item.status,
              scoringBasis: item.scoring_basis,
              confidence: item.confidence,
              needsReview: item.needs_review,
              errorTags: json([]),
              errorAnalysis: null,
            },
          });
        }
      });
    }

    const evaluationByQuestion = new Map(
      evaluation.evaluations.map((item) => [questionKey(item.paper_id, item.question_id), item]),
    );
    // 判分环节可能仍写入了别的值，这里再把涂卡读数落库一次，确保库中与内存一致
    if (bubbleAnswerByKey.size > 0) {
      await db.$transaction(async (tx) => {
        const active = await tx.job.findFirst({
          where: { id: lease.jobId, runToken: lease.runToken, status: "running", analysis: { activeRunToken: lease.runToken } },
          select: { id: true },
        });
        if (!active) throw new StaleJobError();
        for (const [key, answer] of bubbleAnswerByKey) {
          const separator = key.indexOf(":");
          await tx.question.updateMany({
            where: { paperId: key.slice(0, separator), questionId: key.slice(separator + 1) },
            data: { studentAnswer: answer },
          });
        }
      });
    }
    const evaluatedQuestions = extraction.questions.map((question) => {
      const item = evaluationByQuestion.get(questionKey(question.paper_id, question.question_id));
      const bubbleAnswer = bubbleAnswerByKey.get(questionKey(question.paper_id, question.question_id));
      return item ? {
        ...question,
        student_answer: bubbleAnswer ?? item.student_answer,
        score: item.score ?? question.score,
        max_score: item.max_score ?? question.max_score,
        status: item.status,
        scoring_basis: item.scoring_basis,
        confidence: item.confidence,
        needs_review: item.needs_review,
      } : question;
    });

    // 卷面分数核对：整页通读答题卡与试卷页，读取总分与教师逐题给分。
    // 逐题裁剪图容易漏掉写在题号旁或分数栏里的得分，整页上下文是分值口径的权威来源。
    await updateProgress(lease, "reviewing", 68, "读取卷面总分与教师给分");
    const scoreSummaryResults = await mapWithConcurrency(analysis.papers, inspectionNodeConcurrency, async (paper) => {
      const sourceImages = imagesForPaper(paper).filter((image) => image.kind !== "answer_key");
      if (sourceImages.length === 0) return null;
      try {
        // 分数与批改标记对压缩敏感，使用原始扫描件；宽幅扫描件附分区放大图，
        // 否则整页缩放后选择题旁的红勾红叉会糊掉，读不到得分记录。
        const { assets, imageMeta, push } = await buildSheetVisionAssets(sourceImages);
        // 红笔批改的逐行细节：整页缩放后勾叉只剩几个像素，必须按作答行裁出来放大
        const regionsByImage: Array<{ image: (typeof sourceImages)[number]; raw: Buffer; regions: RedMarkRegion[] }> = [];
        for (const image of sourceImages) {
          const raw = await readPrivateFile(image.storageKey);
          const regions = await findRedMarkRegions(raw).catch(() => [] as RedMarkRegion[]);
          regionsByImage.push({ image, raw, regions });
        }
        const markImage = [...regionsByImage].sort((a, b) => b.regions.length - a.regions.length)[0];
        for (const region of groupRedMarkRegions(markImage?.regions ?? []).slice(0, 12)) {
          const data = await sharp(markImage.raw)
            .extract(region)
            .resize({ width: Math.min(1400, Math.max(region.width * 3, 700)) })
            .jpeg({ quality: 92 })
            .toBuffer();
          push(data, "image/jpeg", "红笔标记放大", markImage.image.id, markImage.image.pageOrder);
        }
        const result = await runValidatedNode(
          lease,
          "score_summary",
          {
            papers: [{
              id: paper.id,
              name: paper.name,
              subject: analysis.subject,
              image_ids: sourceImages.map((image) => image.id),
              images: imageMeta,
            }],
          },
          scoreSummarySchema,
          assets,
        );
        const summary = result.papers.find((item) => item.paper_id === paper.id) ?? result.papers[0];
        return summary ? { paperId: paper.id, summary } : null;
      } catch (error) {
        if (error instanceof StaleJobError) throw error;
        console.error(`[score_summary] 「${paper.name}」读取失败: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    });
    const scoreSummaries = scoreSummaryResults.filter((item): item is NonNullable<typeof item> => item !== null);
    // 红笔批改标记单独读一遍：只带“作答行放大图”，只问每行的勾叉/分数。
    // 与涂卡同一个思路——任务越窄，读得越准；整页与多种问题混在一起时勾叉会被读错。
    const markReadingResults = await mapWithConcurrency(analysis.papers, inspectionNodeConcurrency, async (paper) => {
      const sourceImages = imagesForPaper(paper).filter((image) => image.kind !== "answer_key");
      if (sourceImages.length === 0) return null;
      try {
        const scanned: Array<{ image: (typeof sourceImages)[number]; raw: Buffer; regions: RedMarkRegion[] }> = [];
        for (const image of sourceImages) {
          const raw = await readPrivateFile(image.storageKey);
          scanned.push({ image, raw, regions: await findRedMarkRegions(raw).catch(() => [] as RedMarkRegion[]) });
        }
        const target = [...scanned].sort((a, b) => b.regions.length - a.regions.length)[0];
        const groups = groupRedMarkRegions(target?.regions ?? [], 2.5, 0.3).slice(0, 8);
        if (groups.length === 0) return null;
        const assets: VisionAsset[] = [];
        for (const region of groups) {
          assets.push({
            mimeType: "image/jpeg",
            data: await sharp(target.raw).extract(region)
              .resize({ width: Math.min(1400, Math.max(region.width * 3, 700)) })
              .jpeg({ quality: 94 })
              .toBuffer(),
          });
        }
        const result = await runValidatedNode(
          lease,
          "mark_reading",
          { image_id: target.image.id, images: groups.map((_, index) => ({ image_index: index + 1, role: "作答行放大" })) },
          markReadingSchema,
          assets,
          1,
        );
        const meta = await sharp(target.raw).metadata();
        return {
          paperId: paper.id,
          marks: result.marks,
          imageId: target.image.id,
          imageWidth: meta.width ?? 1,
          imageHeight: meta.height ?? 1,
          bands: groups,
          regions: target?.regions ?? [],
        };
      } catch (error) {
        if (error instanceof StaleJobError) throw error;
        console.error(`[mark_reading] 「${paper.name}」读取失败: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    });
    const markReadings = markReadingResults.filter((item): item is NonNullable<typeof item> => item !== null);
    // 权威答案读取：客观题直接拿学生的涂卡答案与标准答案比对判定，不再依赖勾叉形状
    const keyReadingResults = await mapWithConcurrency(analysis.papers, inspectionNodeConcurrency, async (paper) => {
      const keyImages = imagesForPaper(paper).filter((image) => image.kind === "answer_key" && !misplacedKeyImageIds.has(image.id));
      if (keyImages.length === 0) return null;
      try {
        const assets: VisionAsset[] = [];
        for (const image of keyImages.slice(0, 8)) {
          assets.push({ mimeType: image.mimeType, data: await readPrivateFile(image.storageKey) });
        }
        const result = await runValidatedNode(
          lease,
          "answer_key_reading",
          { paper_id: paper.id, image_ids: keyImages.map((image) => image.id) },
          answerKeySchema,
          assets,
          1,
        );
        return { paperId: paper.id, answers: result.answers };
      } catch (error) {
        if (error instanceof StaleJobError) throw error;
        console.error(`[answer_key] 「${paper.name}」读取失败: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    });
    const keyReadings = keyReadingResults.filter((item): item is NonNullable<typeof item> => item !== null);
    // 每张卷的选择题评分规则不同（物理“选对但不全得 3 分”、数学按项比例），规则印在卷首
    const paperRules = new Map<string, ObjectiveRule[]>();
    await Promise.all(analysis.papers.map(async (paper) => {
      const paperPages = imagesForPaper(paper).filter((image) => image.kind !== "answer_key" && image.classification === "paper");
      const source = paperPages.length > 0 ? paperPages : imagesForPaper(paper).filter((image) => image.kind !== "answer_key");
      if (source.length === 0) return;
      try {
        const assets: VisionAsset[] = [];
        for (const image of source.slice(0, 6)) {
          assets.push({ mimeType: image.mimeType, data: await readPrivateFile(image.storageKey) });
        }
        const result = await runValidatedNode(
          lease,
          "scoring_rule_reading",
          { paper_id: paper.id, image_ids: source.map((image) => image.id) },
          scoringRuleSchema,
          assets,
          1,
        );
        if (result.rules.length > 0) paperRules.set(paper.id, result.rules);
      } catch (error) {
        if (error instanceof StaleJobError) throw error;
        console.error(`[scoring_rule] 「${paper.name}」读取失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));
    if (scoreSummaries.length > 0 || markReadings.length > 0 || keyReadings.length > 0) {
      const appliedMarks: string[] = [];
      const paperTotals: Array<{ paperId: string; totalScore: number | null; scannedMaxScore: number | null }> = [];
      for (const item of scoreSummaries) {
        appliedMarks.push(...applyScoreSummaryMarks(evaluatedQuestions, item.paperId, item.summary.question_marks));
        paperTotals.push({
          paperId: item.paperId,
          totalScore: item.summary.total_score,
          scannedMaxScore: item.summary.declared_max_score,
        });
      }
      // 专项标记读数后应用，选择题的勾叉结论以它为准
      for (const item of markReadings) {
        appliedMarks.push(...applyScoreSummaryMarks(evaluatedQuestions, item.paperId, item.marks));
      }
      // 证据回看要能看见学生的作答与老师的批改：把“作答行放大图”对应的答题卡区域
      // 作为首选证据挂到题目上（原来只有试卷页的题干细条，看不到作答与批改）
      for (const item of markReadings) {
        // 同一段图里的标记数与该段内的作答行数一致时，按行序一一对应，
        // 证据就能精确落到这一题所在的那一行，而不是整段
        const rowByBandIndex = new Map<number, RedMarkRegion[]>();
        const marksPerBand = new Map<number, typeof item.marks>();
        for (const mark of item.marks) {
          const index = (mark.image_index ?? 0) - 1;
          marksPerBand.set(index, [...(marksPerBand.get(index) ?? []), mark]);
        }
        for (const [index, marks] of marksPerBand) {
          const band = item.bands[index];
          if (!band) continue;
          const inside = item.regions.filter((region) => region.left >= band.left - 4 && region.left + region.width <= band.left + band.width + 4
            && region.top >= band.top - 4 && region.top + region.height <= band.top + band.height + 4);
          // 行区域与标记都按阅读顺序排列：数量一致时严格对应；数量不一致但都成行时，
          // 按序取前若干行对应，剩下的回退到整段，避免所有题共用一张大图
          if (inside.length >= 2 && marks.length >= 2) {
            rowByBandIndex.set(index, [...inside].sort((a, b) => a.top - b.top || a.left - b.left));
          }
        }
        const rowCursor = new Map<number, number>();
        for (const mark of item.marks) {
          const bandIndex = (mark.image_index ?? 0) - 1;
          const rows = rowByBandIndex.get(bandIndex);
          let band = rows?.[rowCursor.get(bandIndex) ?? 0];
          if (rows) rowCursor.set(bandIndex, (rowCursor.get(bandIndex) ?? 0) + 1);
          if (!band) band = item.bands[bandIndex];
          if (!band || !item.imageId) continue;
          const questionId = normalizeQuestionId(mark.question_no);
          const target = evaluatedQuestions.find(
            (question) => question.paper_id === item.paperId
              && (question.question_id === questionId || normalizeQuestionId(question.question_no) === questionId),
          );
          if (!target) continue;
          const bbox = {
            x: Number((band.left / item.imageWidth).toFixed(5)),
            y: Number((band.top / item.imageHeight).toFixed(5)),
            width: Number((band.width / item.imageWidth).toFixed(5)),
            height: Number((band.height / item.imageHeight).toFixed(5)),
          };
          const already = target.evidence.some((existing) => existing.image_id === item.imageId
            && Math.abs(existing.bbox.x - bbox.x) < 0.001 && Math.abs(existing.bbox.y - bbox.y) < 0.001);
          if (already) continue;
          target.evidence = [{ image_id: item.imageId, bbox }, ...target.evidence];
          appliedMarks.push(questionKey(target.paper_id, target.question_id));
        }
      }
      // 最后用权威答案判客观题：这一步的结论覆盖勾叉（勾叉只是同一事实的另一来源）
      appliedMarks.push(...applyAnswerKeyScoring(evaluatedQuestions, keyReadings, paperRules));
      // 已读到分数但状态仍停在 unknown 的题（如解答题老师只写了“7分”）：按分数反推状态。
      // 否则逐题表会出现“状态—、却有得分”，还会被排除在统计之外（19 题的卷子只统计 18 题）
      for (const question of evaluatedQuestions) {
        if (question.status !== "unknown") continue;
        if (question.score === null || question.max_score === null || question.max_score <= 0) continue;
        if (question.score > question.max_score + 0.001) continue;
        const answerText = (question.student_answer ?? "").trim();
        question.status = statusFromScore(question.score, question.max_score, answerText.length > 0 && answerText !== "unknown");
        if (question.scoring_basis === "unavailable") question.scoring_basis = "teacher_mark";
        question.confidence = Math.max(question.confidence ?? 0, 0.85);
        question.needs_review = false;
        appliedMarks.push(questionKey(question.paper_id, question.question_id));
      }
      const changedKeys = new Set(appliedMarks);
      await db.$transaction(async (tx) => {
        const active = await tx.job.findFirst({
          where: { id: lease.jobId, runToken: lease.runToken, status: "running", analysis: { activeRunToken: lease.runToken } },
          select: { id: true },
        });
        if (!active) throw new StaleJobError();
        for (const question of evaluatedQuestions) {
          if (!changedKeys.has(questionKey(question.paper_id, question.question_id))) continue;
          await tx.question.updateMany({
            where: { paperId: question.paper_id, questionId: question.question_id },
            data: {
              score: question.score ?? undefined,
              maxScore: question.max_score ?? undefined,
              evidence: json(question.evidence),
              status: question.status,
              scoringBasis: question.scoring_basis,
              confidence: question.confidence,
              needsReview: question.needs_review,
            },
          });
        }
        for (const total of paperTotals) {
          await tx.paper.updateMany({
            where: { id: total.paperId },
            data: {
              totalScore: total.totalScore ?? undefined,
              scannedMaxScore: total.scannedMaxScore ?? undefined,
            },
          });
        }
      });
      const itemized = evaluatedQuestions.reduce((sum, question) => sum + (question.score ?? 0), 0);
      const scanned = paperTotals.reduce((sum, total) => sum + (total.totalScore ?? 0), 0);
      console.error(`[score_summary] 应用教师给分 ${appliedMarks.length} 条；逐题合计 ${Number(itemized.toFixed(1))} 分，卷面总分 ${scanned} 分`);
    }
    const evaluatedQuestionBatches = chunks(evaluatedQuestions, questionChunkSize);

    await updateProgress(lease, "analyzing", 72, "知识点映射与错误归因");
    const knowledgeBatches = await mapWithConcurrency(evaluatedQuestionBatches, textConcurrency, async (questions) =>
      runValidatedNode(
        lease,
        "knowledge_mapping",
        { subject: analysis.subject, grade: analysis.grade, questions },
        knowledgeMappingSchema,
      ),
    );
    const expectedQuestionKeys = new Set(evaluatedQuestions.map((question) => questionKey(question.paper_id, question.question_id)));
    const knowledgeByQuestion = new Map(
      knowledgeBatches
        .flatMap((batch) => batch.mappings)
        .filter((item) => expectedQuestionKeys.has(questionKey(item.paper_id, item.question_id)))
        .map((item) => [questionKey(item.paper_id, item.question_id), item]),
    );
    const knowledge = { mappings: [...knowledgeByQuestion.values()] };
    if (knowledge.mappings.length > 0) {
      await db.$transaction(async (tx) => {
        const active = await tx.job.findFirst({
          where: { id: lease.jobId, runToken: lease.runToken, status: "running", analysis: { activeRunToken: lease.runToken } },
          select: { id: true },
        });
        if (!active) throw new StaleJobError();
        for (const item of knowledge.mappings) {
          const target = evaluatedQuestions.find(
            (question) => question.paper_id === item.paper_id && question.question_id === item.question_id,
          );
          // 提取阶段漏标难度的题，用这一步的结论补齐（两份都可以作准，先到先得）
          const difficulty = target?.difficulty ?? item.difficulty ?? null;
          if (target && !target.difficulty && item.difficulty) target.difficulty = item.difficulty;
          await tx.question.updateMany({
            where: { paperId: item.paper_id, questionId: item.question_id },
            data: { knowledgePoints: json(item.knowledge_points), difficulty },
          });
        }
      });
    }
    const errorBatches = await mapWithConcurrency(evaluatedQuestionBatches, textConcurrency, async (questions) => {
      const questionKeys = new Set(questions.map((question) => questionKey(question.paper_id, question.question_id)));
      return runValidatedNode(
        lease,
        "error_analysis",
        {
          questions,
          knowledge_mappings: knowledge.mappings.filter((mapping) => questionKeys.has(questionKey(mapping.paper_id, mapping.question_id))),
        },
        errorAnalysisSchema,
      );
    });
    const errors = { errors: errorBatches.flatMap((batch) => batch.errors) };
    const evaluatedByQuestion = new Map(
      evaluatedQuestions.map((question) => [questionKey(question.paper_id, question.question_id), question]),
    );
    const hasErrorUpdates = errors.errors.some((item) => {
      const question = evaluatedByQuestion.get(questionKey(item.paper_id, item.question_id));
      return Boolean(question && question.status !== "unknown");
    });
    if (hasErrorUpdates) {
      await db.$transaction(async (tx) => {
        const active = await tx.job.findFirst({
          where: { id: lease.jobId, runToken: lease.runToken, status: "running", analysis: { activeRunToken: lease.runToken } },
          select: { id: true },
        });
        if (!active) throw new StaleJobError();
        for (const item of errors.errors) {
          const question = evaluatedByQuestion.get(questionKey(item.paper_id, item.question_id));
          if (!question || question.status === "unknown") continue;
          const isCorrect = question.status === "correct";
          await tx.question.updateMany({
            where: { paperId: item.paper_id, questionId: item.question_id },
            data: {
              // 正确题只保留要点评析（explanation），标签与练习清空；错误题写归因与同类练习
              errorTags: isCorrect ? json([]) : json([...new Set(item.error_tags.map(localizeErrorTag))]),
              errorAnalysis: item.explanation,
              needsReview: question.needs_review || item.needs_review,
              aiPracticeQuestions: json(isCorrect ? [] : item.practice_questions),
            },
          });
        }
      });
    }

    const papersWithQuestions = await db.paper.findMany({
      where: { analysisId: lease.analysisId },
      orderBy: { paperOrder: "asc" },
      include: { questions: true },
    });
    const mode = resolveAnalysisMode(analysis.mode, papersWithQuestions.length);
    const modeEntries = buildModeEntries(papersWithQuestions, analysis.studentNickname, mode);
    const statistics = computeStatistics(papersWithQuestions);
    const evidenceQuestionIds = papersWithQuestions.flatMap((paper) =>
      paper.questions
        .filter((question) => isReportableQuestion(question) && Array.isArray(question.evidence) && question.evidence.length > 0)
        .map((question) => mode === "MULTIPLE_STUDENTS_SINGLE_PAPER" ? paper.id + ":" + question.questionId : question.questionId),
    );

    await updateProgress(lease, "analyzing", 82, mode === "MULTIPLE_STUDENTS_SINGLE_PAPER" ? "整体学情与个人差异分析" : mode === "SINGLE_STUDENT_SINGLE_PAPER" ? "本卷优势与薄弱项分析" : "跨试卷趋势、优势与薄弱项分析");
    let reportSpec;
    const reportContext = {
      nickname: analysis.studentNickname,
      grade: analysis.grade,
      subject: analysis.subject,
      semester: analysis.semester,
      statistics,
      evidenceQuestionIds,
    };
    if (evaluatedQuestionCount(statistics) === 0) {
      await updateProgress(lease, "rendering", 93, "生成报告");
      reportSpec = buildEvidenceLimitedReportSpec(reportContext);
    } else {
      const semesterAnalysis = await runValidatedNode(
        lease,
        "semester_analysis",
        {
          mode, mode_instruction: modeInstructions[mode], entries: modeEntries,
          student_nickname: analysis.studentNickname,
          grade: analysis.grade,
          subject: analysis.subject,
          semester: analysis.semester,
          statistics,
          evidence_policy: "只分析 status 非 unknown 的题；无分值时不得描述得分率。",
          questions: papersWithQuestions.flatMap((p) =>
            p.questions.filter(isReportableQuestion).map((q) => ({
              paper_id: p.id,
              paper_name: p.name,
              exam_date: p.examDate?.toISOString().slice(0, 10) ?? null,
              student_nickname: p.studentNickname ?? analysis.studentNickname,
              question_id: mode === "MULTIPLE_STUDENTS_SINGLE_PAPER" ? p.id + ":" + q.questionId : q.questionId,
              question_no: q.questionNo,
              question_text: q.questionText,
              student_answer: q.studentAnswer,
              status: q.status,
              score: q.score,
              max_score: q.maxScore,
              knowledge_points: q.knowledgePoints,
              error_tags: q.errorTags,
              error_analysis: q.errorAnalysis,
              confidence: q.confidence,
            })),
          ),
        },
        semesterAnalysisSchema,
      );

      await updateProgress(lease, "rendering", 93, "生成受控报告结构");
      const plannedSpec = await runValidatedNode(
        lease,
        "report_planning",
        {
          mode, mode_instruction: modeInstructions[mode], entries: modeEntries,
          student_nickname: analysis.studentNickname,
          grade: analysis.grade,
          subject: analysis.subject,
          semester: analysis.semester,
          statistics,
          semester_analysis: semesterAnalysis,
          quality_contract: {
            audience: mode === "MULTIPLE_STUDENTS_SINGLE_PAPER" ? "任课教师与教研汇报" : "学生、家长与任课教师",
            narrative: "结论必须有统计或题目证据，建议必须有周期、动作和达标标准",
            density: "内容充实但避免重复；优势 3–5 项，补强项 3 项，行动 3–4 项",
            evidence: "优先选择明确失分、错误归因完整且有截图证据的题目",
          },
          allowed_components: [
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
        },
        reportSpecSchema,
      );
      reportSpec = enforceEvidenceBoundary(plannedSpec, reportContext);
    }
    if (misplacedKeyImages.length > 0) {
      const names = misplacedKeyImages.map((image) => image.fileName).join("、");
      const warning = `上传通道提醒：权威答案通道里的「${names}」看起来是学生的作答页（含答题卡/考号/总分等字样），已不用于读取标准答案。请把它改传到答题卡通道后重跑，否则该页的作答与得分不会被统计。`;
      reportSpec = { ...reportSpec, caveat: `${reportSpec.caveat}${reportSpec.caveat ? " " : ""}${warning}` };
    }
    reportSpec = applyModeReport(reportSpec, mode, modeEntries);

    await db.$transaction(async (tx) => {
      const claimed = await tx.job.updateMany({
        where: { id: lease.jobId, runToken: lease.runToken, status: "running", analysis: { activeRunToken: lease.runToken } },
        data: { status: "running", currentStep: "正在保存报告" },
      });
      if (claimed.count !== 1) throw new StaleJobError();
      await tx.report.upsert({
        where: { analysisId: lease.analysisId },
        create: {
          analysisId: lease.analysisId,
          schemaVersion: REPORT_SCHEMA_VERSION,
          templateVersion: REPORT_TEMPLATE_VERSION,
          statistics: json(statistics),
          reportSpec: json(reportSpec),
        },
        update: {
          status: "ready",
          schemaVersion: REPORT_SCHEMA_VERSION,
          templateVersion: REPORT_TEMPLATE_VERSION,
          statistics: json(statistics),
          reportSpec: json(reportSpec),
          version: { increment: 1 },
        },
      });
      const completedAnalysis = await tx.analysis.updateMany({
        where: { id: lease.analysisId, activeRunToken: lease.runToken },
        data: { status: "completed", progress: 100, currentStep: "报告已生成", failureReason: null, activeRunToken: null },
      });
      if (completedAnalysis.count !== 1) throw new StaleJobError();
      await tx.job.update({
        where: { id: lease.jobId },
        data: { status: "completed", progress: 100, currentStep: "报告已生成", completedAt: new Date(), lockKey: null },
      });
    });
  } catch (error) {
    if (error instanceof StaleJobError) return;
    const message = error instanceof Error ? error.message : "分析失败";
    await db.$transaction(async (tx) => {
      const failedJob = await tx.job.updateMany({
        where: { id: lease.jobId, runToken: lease.runToken, status: { in: ["queued", "running"] } },
        data: { status: "failed", currentStep: "分析失败，可重试任务", error: message, completedAt: new Date(), lockKey: null },
      });
      if (failedJob.count !== 1) return;
      await tx.analysis.updateMany({
        where: { id: lease.analysisId, activeRunToken: lease.runToken },
        data: { status: "failed", currentStep: "分析失败，可重试任务", failureReason: message, activeRunToken: null },
      });
    });
  }
}

export function startAnalysisPipeline(analysisId: string, jobId: string, runToken: string) {
  const current = activeJobs.get(analysisId);
  if (current?.jobId === jobId) return current.promise;
  const promise = performPipeline({ analysisId, jobId, runToken }).finally(() => {
    if (activeJobs.get(analysisId)?.jobId === jobId) activeJobs.delete(analysisId);
  });
  activeJobs.set(analysisId, { jobId, promise });
  return promise;
}

export async function refreshReportStatistics(analysisId: string) {
  const papers = await db.paper.findMany({ where: { analysisId }, orderBy: { paperOrder: "asc" }, include: { questions: true } });
  const statistics = computeStatistics(papers);
  const report = await db.report.findUnique({ where: { analysisId } });
  if (report) {
    await db.report.update({ where: { id: report.id }, data: { statistics: json(statistics), version: { increment: 1 } } });
  }
  return statistics;
}
