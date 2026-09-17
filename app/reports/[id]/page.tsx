import { ReportView } from "@/components/ReportView";
import { getReportViewData } from "@/lib/report-data";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getReportViewData(id);
  return <><div className="main" style={{ paddingBottom: 0 }}><Link href={`/learning?analysis=${data.analysisId}`} className="button">生成或查看学习计划 →</Link></div><ReportView data={data} /></>;
}
