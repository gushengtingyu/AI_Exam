import { updateTask } from "@/lib/learning/plan-service";
import { learningResponse } from "@/lib/learning/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) { return learningResponse(async () => updateTask((await context.params).id, await request.json())); }

