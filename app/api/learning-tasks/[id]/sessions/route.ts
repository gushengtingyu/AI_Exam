import { createSession } from "@/lib/learning/practice-service";
import { learningResponse, requireKey } from "@/lib/learning/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) { return learningResponse(async () => createSession((await context.params).id, requireKey(request)), 201); }

