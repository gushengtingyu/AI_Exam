-- AlterTable
ALTER TABLE "Analysis" ADD COLUMN "learnerId" TEXT;
ALTER TABLE "Analysis" ADD COLUMN "ownerId" TEXT;

-- AlterTable
ALTER TABLE "Paper" ADD COLUMN "learnerId" TEXT;

-- CreateTable
CREATE TABLE "Learner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT,
    "nickname" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "curriculumVersion" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LearningPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT,
    "learnerId" TEXT NOT NULL,
    "sourceAnalysisId" TEXT NOT NULL,
    "activeKey" TEXT,
    "cycleDays" INTEGER NOT NULL,
    "dailyTaskLimit" INTEGER NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "evidenceLimited" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearningPlan_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LearningTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "sourceQuestionId" TEXT,
    "knowledgePoint" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetLevel" INTEGER NOT NULL DEFAULT 3,
    "targetCount" INTEGER NOT NULL DEFAULT 5,
    "successCriteria" TEXT NOT NULL,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dueDate" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearningTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "LearningPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PracticeQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceQuestionId" TEXT,
    "subject" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "knowledgePoint" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT [],
    "referenceAnswer" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "qualityStatus" TEXT NOT NULL DEFAULT 'validated',
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LearningTaskQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearningTaskQuestion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "LearningTask" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LearningTaskQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PracticeQuestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PracticeSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT,
    "learnerId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "activeTaskId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentLevel" INTEGER NOT NULL DEFAULT 1,
    "correctStreak" INTEGER NOT NULL DEFAULT 0,
    "wrongStreak" INTEGER NOT NULL DEFAULT 0,
    "effectiveAttempts" INTEGER NOT NULL DEFAULT 0,
    "nextQuestionId" TEXT,
    "questionStatus" TEXT NOT NULL DEFAULT 'generating',
    "generationToken" TEXT,
    "generationStartedAt" DATETIME,
    "lastError" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PracticeSession_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PracticeSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "LearningTask" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PracticeAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "clientAttemptId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "gradingStatus" TEXT NOT NULL DEFAULT 'submitted',
    "result" TEXT,
    "confidence" REAL,
    "feedback" TEXT,
    "gradingToken" TEXT,
    "gradingStartedAt" DATETIME,
    "gradingAttempts" INTEGER NOT NULL DEFAULT 0,
    "masteryBefore" REAL,
    "masteryAfter" REAL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gradedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PracticeAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PracticeAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PracticeQuestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeMastery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "learnerId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "knowledgePoint" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeMastery_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MasterySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "masteryId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "previousScore" REAL NOT NULL,
    "newScore" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MasterySnapshot_masteryId_fkey" FOREIGN KEY ("masteryId") REFERENCES "KnowledgeMastery" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LearningRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AiRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT,
    "contextType" TEXT NOT NULL DEFAULT 'analysis',
    "contextId" TEXT,
    "inputHash" TEXT,
    "node" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "inputJson" JSONB NOT NULL,
    "outputJson" JSONB,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiRun_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AiRun" ("analysisId", "attempt", "createdAt", "durationMs", "error", "id", "inputJson", "node", "outputJson", "status", "inputHash") SELECT "analysisId", "attempt", "createdAt", "durationMs", "error", "id", "inputJson", "node", "outputJson", "status", "inputHash" FROM "AiRun";
DROP TABLE "AiRun";
ALTER TABLE "new_AiRun" RENAME TO "AiRun";
CREATE INDEX "idx_ai_run_analysis_node" ON "AiRun"("analysisId", "node", "createdAt");
CREATE INDEX "idx_ai_run_cache" ON "AiRun"("analysisId", "node", "inputHash");
CREATE INDEX "AiRun_contextType_contextId_createdAt_idx" ON "AiRun"("contextType", "contextId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "LearningPlan_activeKey_key" ON "LearningPlan"("activeKey");

-- CreateIndex
CREATE INDEX "LearningPlan_learnerId_createdAt_idx" ON "LearningPlan"("learnerId", "createdAt");

-- CreateIndex
CREATE INDEX "LearningPlan_sourceAnalysisId_idx" ON "LearningPlan"("sourceAnalysisId");

-- CreateIndex
CREATE INDEX "LearningTask_planId_dueDate_idx" ON "LearningTask"("planId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "LearningTask_planId_order_key" ON "LearningTask"("planId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeQuestion_contentHash_key" ON "PracticeQuestion"("contentHash");

-- CreateIndex
CREATE INDEX "PracticeQuestion_sourceQuestionId_knowledgePoint_level_status_idx" ON "PracticeQuestion"("sourceQuestionId", "knowledgePoint", "level", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LearningTaskQuestion_taskId_questionId_key" ON "LearningTaskQuestion"("taskId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningTaskQuestion_taskId_order_key" ON "LearningTaskQuestion"("taskId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeSession_activeTaskId_key" ON "PracticeSession"("activeTaskId");

-- CreateIndex
CREATE INDEX "PracticeSession_learnerId_updatedAt_idx" ON "PracticeSession"("learnerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeAttempt_clientAttemptId_key" ON "PracticeAttempt"("clientAttemptId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_sessionId_submittedAt_idx" ON "PracticeAttempt"("sessionId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeMastery_learnerId_subject_knowledgePoint_key" ON "KnowledgeMastery"("learnerId", "subject", "knowledgePoint");

-- CreateIndex
CREATE UNIQUE INDEX "MasterySnapshot_masteryId_sourceType_sourceId_key" ON "MasterySnapshot"("masteryId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningRequest_key_key" ON "LearningRequest"("key");
