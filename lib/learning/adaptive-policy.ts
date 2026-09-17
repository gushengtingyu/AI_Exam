export const POLICY = Object.freeze({ maxAttempts: 8, streakToAdvance: 2, wrongToReview: 2, confidenceThreshold: 0.8, maxMasteryDelta: 8 });

export type GradingResult = "correct" | "partial" | "wrong" | "needs_review";
export type AdaptiveState = { currentLevel: number; correctStreak: number; wrongStreak: number; effectiveAttempts: number };

export function advance(state: AdaptiveState, result: GradingResult, targetCount: number, targetLevel = 3) {
  if (result === "needs_review") return { ...state, status: "blocked", taskStatus: "needs_review" };
  const effectiveAttempts = state.effectiveAttempts + 1;
  const correctStreak = result === "correct" ? state.correctStreak + 1 : 0;
  const wrongStreak = result === "wrong" ? state.wrongStreak + 1 : 0;
  const passed = state.currentLevel >= targetLevel && correctStreak >= POLICY.streakToAdvance && effectiveAttempts >= targetCount;
  const review = wrongStreak >= POLICY.wrongToReview || (effectiveAttempts >= POLICY.maxAttempts && !passed);
  const promoted = result === "correct" && correctStreak >= POLICY.streakToAdvance && state.currentLevel < targetLevel;
  return {
    currentLevel: result === "wrong" ? Math.max(1, state.currentLevel - 1) : promoted ? Math.min(3, state.currentLevel + 1) : state.currentLevel,
    correctStreak: promoted ? 0 : correctStreak,
    wrongStreak,
    effectiveAttempts,
    status: passed ? "completed" : review ? "blocked" : "active",
    taskStatus: passed ? "completed" : review ? "needs_review" : "active",
  };
}

export function initialLevel(score?: number) {
  return score === undefined ? 1 : score >= 80 ? 3 : score >= 60 ? 2 : 1;
}

export function masteryDelta(level: number, result: GradingResult) {
  if (result === "needs_review") return 0;
  if (result === "partial") return 1;
  const change = Math.min(POLICY.maxMasteryDelta, 2 + Math.max(1, Math.min(3, level)) * 2);
  return result === "correct" ? change : -change;
}

export function normalizeAnswer(answer: string) {
  return answer.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function numericAnswer(answer: string): number | null {
  const value = normalizeAnswer(answer).replace(/\s/g, "");
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  const fraction = /^([+-]?\d+)\/([+-]?\d+)$/.exec(value);
  if (!fraction || Number(fraction[2]) === 0) return null;
  const number = Number(fraction[1]) / Number(fraction[2]);
  return Number.isFinite(number) ? number : null;
}

export function objectiveGrade(type: string, answer: string, reference: string): GradingResult | null {
  if (!reference.trim()) return "needs_review";
  if (type === "numeric") {
    const expected = numericAnswer(reference);
    if (expected === null) return "needs_review";
    const actual = numericAnswer(answer);
    if (actual === null) return "needs_review";
    return Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)) ? "correct" : "wrong";
  }
  if (type === "single_choice") return normalizeAnswer(answer) === normalizeAnswer(reference) ? "correct" : "wrong";
  return null;
}
