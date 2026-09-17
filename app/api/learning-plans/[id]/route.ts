import { getPlan } from "@/lib/learning/plan-service";
import { learningResponse } from "@/lib/learning/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) { return learningResponse(async () => getPlan((await context.params).id)); }

