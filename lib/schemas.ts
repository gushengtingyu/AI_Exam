import { z } from "zod";
import { REPORT_COMPONENTS, SCORING_BASES, QUESTION_STATUSES } from "./constants";

export const createAnalysisSchema = z.object({
  learner_id: z.string().min(1).max(100).optional(),
  mode: z.enum(["SINGLE_STUDENT_SINGLE_PAPER", "SINGLE_STUDENT_MULTIPLE_PAPERS", "MULTIPLE_STUDENTS_SINGLE_PAPER"]).optional(),
  student_nickname: z.string().trim().min(1).max(40),
  grade: z.string().trim().min(1).max(30),
  subject: z.string().trim().min(1).max(30),
  semester: z.string().trim().min(1).max(50),
  papers: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        learner_id: z.string().min(1).max(100).optional(),
        student_nickname: z.string().trim().min(1).max(40).optional(),
        date: z.string().date().nullable().optional(),
        max_score: z.number().positive().max(1000).nullable().optional(),
      }),
    )
    .min(1)
    .max(20),
}).superRefine((input, ctx) => {
  const mode = input.mode ?? (input.papers.length > 1 ? "SINGLE_STUDENT_MULTIPLE_PAPERS" : "SINGLE_STUDENT_SINGLE_PAPER");
  const issue = (message: string) => ctx.addIssue({ code: "custom", path: ["papers"], message });
  if (mode === "SINGLE_STUDENT_SINGLE_PAPER" && input.papers.length !== 1) issue("单人单卷只能提交一套试卷");
  if (mode !== "SINGLE_STUDENT_SINGLE_PAPER" && input.papers.length < 2) issue("请提交至少两套试卷或两位学生作答");
  if (mode === "MULTIPLE_STUDENTS_SINGLE_PAPER") {
    const students = input.papers.map(p => p.student_nickname);
    if (students.some(s => !s) || new Set(students).size !== students.length) issue("学生昵称不能为空或重复");
    const shared = input.papers[0];
    if (input.papers.some(p => p.name !== shared.name || p.date !== shared.date || p.max_score !== shared.max_score)) issue("多人同卷必须使用相同的试卷名称、日期和满分");
  }
});

export const bboxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
});

export const evidenceSchema = z.object({
  image_id: z.string(),
  bbox: bboxSchema,
});

export const pageQualitySchema = z.object({
  pages: z.array(
    z.object({
      image_id: z.string(),
      quality: z.enum(["good", "acceptable", "blurry"]),
      sharpness: z.number().min(0).max(1),
      rotation_degrees: z.number().min(-180).max(180),
      issues: z.array(z.string()),
      needs_reupload: z.boolean(),
    }),
  ),
});

export const documentClassificationSchema = z.object({
  pages: z.array(
    z.object({
      image_id: z.string(),
      document_type: z.enum(["paper", "answer_key", "draft", "irrelevant", "unknown"]),
      paper_group: z.string().nullable(),
      page_no: z.number().int().positive().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export const ocrLayoutSchema = z.object({
  pages: z.array(
    z.object({
      image_id: z.string(),
      text: z.string(),
      blocks: z.array(
        z.object({
          type: z.enum(["question", "student_answer", "teacher_mark", "score", "other"]),
          text: z.string(),
          bbox: bboxSchema,
          confidence: z.number().min(0).max(1),
        }),
      ),
    }),
  ),
});

export const extractedQuestionSchema = z.object({
  paper_id: z.string(),
  question_id: z.string(),
  question_no: z.string(),
  question_text: z.string(),
  student_answer: z.string(),
  score: z.number().nullable(),
  max_score: z.number().positive().nullable(),
  status: z.enum(QUESTION_STATUSES),
  knowledge_points: z.array(z.string()),
  error_tags: z.array(z.string()),
  evidence: z.array(evidenceSchema),
  confidence: z.number().min(0).max(1),
  needs_review: z.boolean(),
  scoring_basis: z.enum(SCORING_BASES),
  difficulty: z.enum(["基础", "中档", "难题"]).nullable().default(null),
});

export const questionExtractionSchema = z.object({ questions: z.array(extractedQuestionSchema) });

export const bubbleDetectionSchema = z.object({
  answers: z.array(
    z.object({
      question_no: z.string(),
      choice: z.string().nullable(),
      note: z.string().optional(),
    }),
  ),
});

export const scoreSummarySchema = z.object({
  papers: z.array(
    z.object({
      paper_id: z.string(),
      total_score: z.number().nullable(),
      declared_max_score: z.number().positive().nullable(),
      question_marks: z.array(
        z.object({
          question_no: z.string(),
          score: z.number().nullable(),
          verdict: z.enum(["correct", "wrong", "partial", "blank"]).nullable().default(null),
          // 同一张放大图里读到的学生涂卡/作答（选择题为选项字母）
          answer: z.string().nullable().default(null),
        }),
      ),
      confidence: z.number().min(0).max(1),
      note: z.string().optional(),
    }),
  ),
});

export const markReadingSchema = z.object({
  marks: z.array(
    z.object({
      question_no: z.string(),
      // 这条标记读自第几张图（对应输入里的 image_index），用于把作答行位置挂到题目上
      image_index: z.number().nullable().default(null),
      // 允许 unknown：模型对个别行没把握时会这样返回，按“无结论”处理，
      // 否则一条 unknown 会让整批标记被校验拒绝、全部作废
      verdict: z.enum(["correct", "wrong", "partial", "blank", "unknown"]),
      score: z.number().nullable().default(null),
    }),
  ),
});

export const scoringRuleSchema = z.object({
  rules: z.array(
    z.object({
      type: z.enum(["single", "multiple"]),
      from: z.number(),
      to: z.number(),
      score: z.number(),
      // 多选的部分分规则：none=不给部分分，flat=固定分（如选对但不全得 3 分），
      // proportional=按比例（满分 × 选对项数 / 正确项数）
      partial: z.enum(["none", "flat", "proportional"]),
      partial_score: z.number().nullable().default(null),
    }),
  ),
  note: z.string().nullable().default(null),
});

export const answerKeySchema = z.object({
  answers: z.array(
    z.object({
      question_no: z.string(),
      answer: z.string(),
    }),
  ),
});

export const answerEvaluationSchema = z.object({
  evaluations: z.array(
    z.object({
      paper_id: z.string(),
      question_id: z.string(),
      student_answer: z.string(),
      score: z.number().nullable(),
      max_score: z.number().positive().nullable(),
      status: z.enum(QUESTION_STATUSES),
      scoring_basis: z.enum(SCORING_BASES),
      rationale: z.string(),
      confidence: z.number().min(0).max(1),
      needs_review: z.boolean(),
    }),
  ),
});

export const knowledgeMappingSchema = z.object({
  mappings: z.array(
    z.object({
      paper_id: z.string(),
      question_id: z.string(),
      knowledge_points: z.array(z.string()).min(1),
      // 难度在这里再判一次：提取阶段偶有漏标的题，靠这一步补齐，报告里不应出现“未标注”
      difficulty: z.enum(["基础", "中档", "难题"]).nullable().default(null),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export const practiceQuestionSchema = z.object({
  question_text: z.string().trim().min(1).max(5000),
  reference_answer: z.string().trim().max(5000).nullable().default(null),
  explanation: z.string().trim().max(5000).nullable().default(null),
});

export const errorAnalysisSchema = z.object({
  errors: z.array(
    z.object({
      paper_id: z.string(),
      question_id: z.string(),
      error_tags: z.array(z.string()),
      explanation: z.string(),
      confidence: z.number().min(0).max(1),
      needs_review: z.boolean(),
      // 错误题恰好 3 道同类练习；正确题的要点评析不带练习（0 道）
      practice_questions: z.array(practiceQuestionSchema).max(3),
    }),
  ),
});

export const semesterAnalysisSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.object({ title: z.string(), detail: z.string(), question_ids: z.array(z.string()) })).max(5),
  weaknesses: z.array(z.object({ title: z.string(), detail: z.string(), question_ids: z.array(z.string()) })).max(3),
  recommendations: z.array(
    z.object({ period: z.string(), title: z.string(), action: z.string(), success_measure: z.string() }),
  ).min(2).max(4),
  caveat: z.string(),
});

export const reportSpecSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  executive_summary: z.string(),
  components: z.array(z.enum(REPORT_COMPONENTS)).min(1),
  strengths: semesterAnalysisSchema.shape.strengths,
  weaknesses: semesterAnalysisSchema.shape.weaknesses,
  recommendations: semesterAnalysisSchema.shape.recommendations,
  evidence_question_ids: z.array(z.string()).max(12),
  caveat: z.string(),
});

export const patchQuestionSchema = z.object({
  question_text: z.string().trim().min(1).max(5000).optional(),
  student_answer: z.string().trim().max(5000).optional(),
  score: z.number().min(0).nullable().optional(),
  max_score: z.number().positive().nullable().optional(),
  status: z.enum(QUESTION_STATUSES).optional(),
  knowledge_points: z.array(z.string().trim().min(1)).max(20).optional(),
  error_tags: z.array(z.string().trim().min(1)).max(20).optional(),
  needs_review: z.boolean().optional(),
  scoring_basis: z.enum(SCORING_BASES).optional(),
}).refine((value) => value.score == null || value.max_score == null || value.score <= value.max_score, {
  message: "得分不能高于满分",
  path: ["score"],
});

export type ReportSpec = z.infer<typeof reportSpecSchema>;
export type ExtractedQuestion = z.infer<typeof extractedQuestionSchema>;
