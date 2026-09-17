import { getSession, scheduleSession } from "@/lib/learning/practice-service";
import { learningResponse } from "@/lib/learning/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) { return learningResponse(async () => { const id = (await context.params).id; const session = await getSession(id); scheduleSession(id); return session; }); }

