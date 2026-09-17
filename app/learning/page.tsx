import { AppHeader } from "@/components/AppHeader";
import { LearningCenter } from "@/components/LearningCenter";
import "./learning.css";
import "./refinements.css";

export const dynamic = "force-dynamic";

export default async function LearningPage({ searchParams }: { searchParams: Promise<{ analysis?: string }> }) {
  const { analysis } = await searchParams;
  return <div className="app-shell"><AppHeader /><LearningCenter analysisId={analysis} /></div>;
}
