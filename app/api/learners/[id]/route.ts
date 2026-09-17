import { getLearner, updateLearner } from "@/lib/learning/learner-service";
import { learningResponse } from "@/lib/learning/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) { return learningResponse(async () => getLearner((await context.params).id)); }
export async function PATCH(request: Request, context: Context) { return learningResponse(async () => updateLearner((await context.params).id, await request.json())); }

