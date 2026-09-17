import { z } from "zod";

export const learnerInput = z.object({
  nickname: z.string().trim().min(1).max(40),
  grade: z.string().trim().min(1).max(30),
  curriculum_version: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
}).strict();
export const learnerPatch = learnerInput.partial().extend({ version: z.number().int().positive() }).strict();
export const planInput = z.object({
  learner_id: z.string().min(1).max(100).optional(),
  cycle_days: z.union([z.literal(7), z.literal(14)]).default(7),
  daily_task_limit: z.number().int().min(1).max(3).default(2),
  question_count_per_task: z.number().int().min(2).max(8).default(5),
}).strict();
export const regenerateInput = planInput.extend({ version: z.number().int().positive() });
export const versionInput = z.object({ version: z.number().int().positive() }).strict();
export const attemptInput = z.object({
  client_attempt_id: z.string().uuid(),
  question_id: z.string().min(1).max(100),
  answer: z.string().min(1).max(10000).refine(value => value.trim().length > 0, "请填写答案"),
  session_version: z.number().int().positive(),
}).strict();
export const generatedQuestion = z.object({
  content: z.string().trim().min(8).max(5000),
  type: z.enum(["numeric", "single_choice", "subjective"]),
  options: z.array(z.object({ key: z.string().regex(/^[A-F]$/), text: z.string().trim().min(1).max(1000) })).max(6),
  reference_answer: z.string().trim().min(1).max(5000),
  explanation: z.string().trim().min(5).max(5000),
  hint: z.string().trim().min(1).max(500),
  level: z.number().int().min(1).max(3),
  knowledge_point: z.string().trim().min(1).max(100),
  within_curriculum: z.literal(true),
}).superRefine((value, context) => {
  if (value.type === "single_choice" && (value.options.length < 2 || new Set(value.options.map(option => option.key)).size !== value.options.length || !value.options.some(option => option.key === value.reference_answer))) {
    context.addIssue({ code: "custom", message: "选项和标准答案不一致" });
  }
});
export const questionBatch = z.object({ questions: z.array(generatedQuestion).min(1).max(3) });
export const gradingOutput = z.object({
  result: z.enum(["correct", "partial", "wrong", "needs_review"]),
  confidence: z.number().min(0).max(1),
  feedback: z.string().trim().min(1).max(1500),
});
