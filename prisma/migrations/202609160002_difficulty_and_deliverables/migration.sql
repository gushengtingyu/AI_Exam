-- 题目难度：基础 / 中档 / 难题
ALTER TABLE "Question" ADD COLUMN "difficulty" TEXT;

-- 报告之后的产物：学习计划 / 针对性作业 / 错题举一反三
CREATE TABLE IF NOT EXISTS "Deliverable" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "analysisId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Deliverable_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_deliverable_analysis_kind" ON "Deliverable"("analysisId", "kind");
