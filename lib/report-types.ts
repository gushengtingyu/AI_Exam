import type { ReportSpec } from "@/lib/schemas";
import type { ReportStatistics } from "@/lib/stats";

export type Evidence = { image_id: string; bbox: { x: number; y: number; width: number; height: number } };

export type AiPracticeQuestion = {
  question_text: string;
  reference_answer: string | null;
  explanation: string | null;
};

export type ReportQuestion = {
  id: string;
  paper_id: string;
  paper_name: string;
  student_nickname?: string;
  question_id: string;
  question_no: string;
  question_text: string;
  student_answer: string;
  status: string;
  score: number | null;
  max_score: number | null;
  knowledge_points: string[];
  error_tags: string[];
  error_analysis: string | null;
  evidence: Evidence[];
  confidence: number;
  scoring_basis: string;
  difficulty: string | null;
  ai_questions: AiPracticeQuestion[];
};

export type ReportViewData = {
  mode?: import("./analysis-modes").AnalysisMode;
  entries?: import("./analysis-modes").ModeEntry[];
  id: string;
  analysisId: string;
  status: string;
  schemaVersion: string;
  templateVersion: string;
  version: number;
  generatedAt: string;
  student: { nickname: string; grade: string; subject: string; semester: string };
  statistics: ReportStatistics;
  spec: ReportSpec;
  questions: ReportQuestion[];
};
