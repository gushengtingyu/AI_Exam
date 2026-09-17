import { submitAttempt } from "@/lib/learning/practice-service";
import { learningResponse } from "@/lib/learning/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) { return learningResponse(async () => submitAttempt((await context.params).id, await request.json())); }

