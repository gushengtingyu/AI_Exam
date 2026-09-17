import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/learning/adaptive-policy.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { advance, initialLevel, masteryDelta, objectiveGrade, numericAnswer } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const initial = () => ({ currentLevel: 1, correctStreak: 0, wrongStreak: 0, effectiveAttempts: 0 });

test("two correct answers at each level advance through all three levels", () => {
  let state = initial();
  for (let count = 1; count <= 6; count++) {
    state = advance(state, "correct", 5);
    assert.equal(state.currentLevel, Math.min(3, Math.floor(count / 2) + 1));
    assert.equal(state.status, count === 6 ? "completed" : "active");
  }
  assert.equal(state.taskStatus, "completed");
});

test("wrong answers downgrade and two consecutive errors require review", () => {
  let state = { ...initial(), currentLevel: 3 };
  state = advance(state, "wrong", 5);
  assert.equal(state.currentLevel, 2);
  state = advance(state, "wrong", 5);
  assert.equal(state.currentLevel, 1);
  assert.equal(state.status, "blocked");
  assert.equal(advance(initial(), "wrong", 5).currentLevel, 1);
});

test("partial answers keep level and reset consecutive streaks", () => {
  const next = advance({ ...initial(), currentLevel: 2, correctStreak: 1, wrongStreak: 1 }, "partial", 5);
  assert.equal(next.currentLevel, 2);
  assert.equal(next.correctStreak, 0);
  assert.equal(next.wrongStreak, 0);
  assert.equal(next.effectiveAttempts, 1);
});

test("eight effective answers cap the task without inventing a pass", () => {
  const next = advance({ ...initial(), effectiveAttempts: 7 }, "partial", 5);
  assert.equal(next.status, "blocked");
  assert.equal(next.taskStatus, "needs_review");
});

test("needs review never changes effective answer count or mastery", () => {
  const state = { ...initial(), effectiveAttempts: 3, correctStreak: 1 };
  const next = advance(state, "needs_review", 5);
  assert.equal(next.effectiveAttempts, 3);
  assert.equal(masteryDelta(3, "needs_review"), 0);
});

test("mastery deltas are bounded and initial level follows evidence", () => {
  assert.deepEqual([1, 2, 3].map(level => masteryDelta(level, "correct")), [4, 6, 8]);
  assert.deepEqual([1, 2, 3].map(level => masteryDelta(level, "wrong")), [-4, -6, -8]);
  assert.equal(initialLevel(), 1);
  assert.equal(initialLevel(60), 2);
  assert.equal(initialLevel(80), 3);
});

test("numeric grading accepts equivalent values but never guesses units or expressions", () => {
  assert.equal(objectiveGrade("numeric", " ０．５０ ", "1/2"), "correct");
  assert.equal(objectiveGrade("numeric", "5", "6"), "wrong");
  assert.equal(objectiveGrade("numeric", "5 cm", "5"), "needs_review");
  assert.equal(objectiveGrade("numeric", "1/0", "5"), "needs_review");
  assert.equal(objectiveGrade("subjective", "x = 5", "5"), null);
  assert.equal(objectiveGrade("single_choice", " ａ ", "A"), "correct");
  assert.equal(numericAnswer("Infinity"), null);
  assert.equal(numericAnswer("1+1"), null);
});
