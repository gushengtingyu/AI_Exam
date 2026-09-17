import { createLearner, listLearners } from "@/lib/learning/learner-service";
import { learningResponse, requireKey } from "@/lib/learning/http";

export const dynamic = "force-dynamic";

export async function GET() { return learningResponse(listLearners); }
export async function POST(request: Request) { return learningResponse(async () => createLearner(requireKey(request), await request.json()), 201); }

