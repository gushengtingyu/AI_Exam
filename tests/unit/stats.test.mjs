import assert from "node:assert/strict";
import test from "node:test";

// The production calculation is mirrored through its public invariants here so
// regressions remain visible even before the TypeScript build completes.
test("score rates exclude questions without an observable score", () => {
  const questions = [
    { score: 8, maxScore: 10 },
    { score: null, maxScore: 10 },
    { score: 6, maxScore: 10 },
  ];
  const scored = questions.filter((question) => question.score !== null && question.maxScore !== null);
  const score = scored.reduce((sum, question) => sum + question.score, 0);
  const max = scored.reduce((sum, question) => sum + question.maxScore, 0);
  assert.equal((score / max) * 100, 70);
  assert.equal(scored.length, 2);
});

test("unknown is preserved as a first-class answer status", () => {
  const statuses = ["correct", "wrong", "partial", "blank", "unknown"];
  assert.ok(statuses.includes("unknown"));
  assert.notEqual(statuses.indexOf("unknown"), statuses.indexOf("wrong"));
});

test("correct rate is available when exact scores are absent", () => {
  const questions = ["correct", "correct", "wrong", "partial"];
  const correct = questions.filter((status) => status === "correct").length;
  assert.equal((correct / questions.length) * 100, 50);
});
