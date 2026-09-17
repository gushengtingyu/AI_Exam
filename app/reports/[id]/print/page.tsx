import { ReportView } from "@/components/ReportView";
import { getReportViewData } from "@/lib/report-data";

export const dynamic = "force-dynamic";

export default async function PrintReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReportView data={await getReportViewData(id)} printMode />;
}
