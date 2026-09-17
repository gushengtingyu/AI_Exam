import { createPlan } from "@/lib/learning/plan-service";
import { learningResponse, requireKey } from "@/lib/learning/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) { return learningResponse(async () => createPlan((await context.params).id, requireKey(request), await request.json()), 201); }

