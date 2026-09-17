export const ANALYSIS_STAGES = [
  { status: "uploaded", label: "已上传", progress: 5 },
  { status: "preprocessing", label: "图像预处理", progress: 14 },
  { status: "ocr", label: "版面识别", progress: 34 },
  { status: "extracting", label: "逐题提取", progress: 52 },
  { status: "reviewing", label: "质量复核", progress: 66 },
  { status: "analyzing", label: "学期分析", progress: 79 },
  { status: "rendering", label: "报告生成", progress: 92 },
  { status: "completed", label: "分析完成", progress: 100 },
] as const;

export const AI_NODES = [
  "page_quality",
  "document_classification",
  "ocr_layout",
  "question_extraction",
  "bubble_detection",
  "score_summary",
  "mark_reading",
  "answer_key_reading",
  "scoring_rule_reading",
  "answer_evaluation",
  "knowledge_mapping",
  "error_analysis",
  "semester_analysis",
  "report_planning",
] as const;

export type AiNodeName = (typeof AI_NODES)[number];

export const QUESTION_STATUSES = ["correct", "wrong", "partial", "blank", "unknown"] as const;
export const SCORING_BASES = ["teacher_mark", "answer_key", "model", "unavailable"] as const;

export const REPORT_COMPONENTS = [
  "overview",
  "score_trend",
  "answer_status_pie",
  "error_distribution",
  "knowledge_heatmap",
  "strengths",
  "weaknesses",
  "recommendations",
  "question_evidence",
] as const;

export const REPORT_SCHEMA_VERSION = "1.0.0";
export const REPORT_TEMPLATE_VERSION = "parent-report-2.2.0";
export const API_CONTRACT_VERSION = "3.0.0";
