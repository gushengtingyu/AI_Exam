import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { API_CONTRACT_VERSION } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const analysisColumns = await db.$queryRaw<Array<{ name: string }>>`PRAGMA table_info("Analysis")`;
    const paperColumns = await db.$queryRaw<Array<{ name: string }>>`PRAGMA table_info("Paper")`;
    const learningTables = await db.$queryRaw<Array<{ name: string }>>`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('Learner', 'LearningPlan', 'LearningTask', 'PracticeQuestion', 'PracticeSession', 'PracticeAttempt', 'KnowledgeMastery', 'MasterySnapshot', 'LearningRequest')`;
    const learningReady = learningTables.length === 9;
    const analysisModes = analysisColumns.some((column) => column.name === "mode")
      && paperColumns.some((column) => column.name === "studentNickname");
    return NextResponse.json({
      status: "ok",
      api_contract_version: API_CONTRACT_VERSION,
      mock_mode: process.env.MOCK_MODE !== "false",
      capabilities: {
        learner_profiles: learningReady,
        learning_plans: learningReady,
        practice_sessions: learningReady,
        adaptive_practice: learningReady,
        analysis_modes: analysisModes,
        idempotency: true,
        explicit_page_order: true,
        server_report_artifacts: true,
        report_error_analysis: true,
      },
    });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unavailable" }, { status: 503 });
  }
}
