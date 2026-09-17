import { NextResponse } from "next/server";
import { apiError, notFound } from "@/lib/http";
import { findReportViewData } from "@/lib/report-data";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const data = await findReportViewData(id);
    if (!data) return notFound("报告不存在");
    return NextResponse.json({
      report_id: data.id,
      mode: data.mode,
      entries: data.entries,
      analysis_id: data.analysisId,
      job_id: null,
      status: data.status,
      schema_version: data.schemaVersion,
      template_version: data.templateVersion,
      version: data.version,
      student: data.student,
      statistics: data.statistics,
      report_spec: data.spec,
      questions: data.questions,
    });
  } catch (error) {
    return apiError(error);
  }
}
