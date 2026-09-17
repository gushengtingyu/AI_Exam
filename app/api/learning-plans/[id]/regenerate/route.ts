import { createPlan, getPlan } from "@/lib/learning/plan-service";
import { learningResponse, requireKey } from "@/lib/learning/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) { return learningResponse(async () => { const id = (await context.params).id; const plan = await getPlan(id); const raw = await request.json(); return createPlan(plan.source_analysis_id, requireKey(request), { ...raw, learner_id: raw.learner_id ?? plan.learner_id }, id); }, 201); }

