import { listPlans } from "@/lib/learning/plan-service";
import { learningResponse } from "@/lib/learning/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) { return learningResponse(() => listPlans(new URL(request.url).searchParams.get("learner_id") || undefined)); }

