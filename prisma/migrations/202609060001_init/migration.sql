-- CreateTable
CREATE TABLE IF NOT EXISTS "Analysis" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "studentNickname" TEXT NOT NULL,
  "grade" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "semester" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'uploaded',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "currentStep" TEXT,
  "failureReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "Paper" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "analysisId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "examDate" DATETIME,
  "maxScore" REAL,
  "paperOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Paper_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "PaperImage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "paperId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'paper',
  "fileName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "processedKey" TEXT,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "pageOrder" INTEGER NOT NULL DEFAULT 0,
  "classification" TEXT NOT NULL DEFAULT 'unknown',
  "qualityStatus" TEXT NOT NULL DEFAULT 'pending',
  "qualityScore" REAL,
  "width" INTEGER,
  "height" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaperImage_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Question" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "paperId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "questionNo" TEXT NOT NULL,
  "questionText" TEXT NOT NULL,
  "studentAnswer" TEXT NOT NULL,
  "score" REAL,
  "maxScore" REAL,
  "status" TEXT NOT NULL DEFAULT 'unknown',
  "knowledgePoints" JSONB NOT NULL,
  "errorTags" JSONB NOT NULL,
  "evidence" JSONB NOT NULL,
  "confidence" REAL NOT NULL,
  "needsReview" BOOLEAN NOT NULL DEFAULT false,
  "scoringBasis" TEXT NOT NULL DEFAULT 'unavailable',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Question_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Job" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "analysisId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "currentStep" TEXT,
  "error" TEXT,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Job_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "AiRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "analysisId" TEXT NOT NULL,
  "node" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "inputJson" JSONB NOT NULL,
  "outputJson" JSONB,
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiRun_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Report" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "analysisId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "schemaVersion" TEXT NOT NULL,
  "templateVersion" TEXT NOT NULL,
  "statistics" JSONB NOT NULL,
  "reportSpec" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Report_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_analysis_status_updated" ON "Analysis"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "idx_paper_analysis_order" ON "Paper"("analysisId", "paperOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "PaperImage_storageKey_key" ON "PaperImage"("storageKey");
CREATE INDEX IF NOT EXISTS "idx_image_paper_kind_order" ON "PaperImage"("paperId", "kind", "pageOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_question_paper_external" ON "Question"("paperId", "questionId");
CREATE INDEX IF NOT EXISTS "idx_question_paper_review" ON "Question"("paperId", "needsReview");
CREATE INDEX IF NOT EXISTS "idx_job_analysis_created" ON "Job"("analysisId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_ai_run_analysis_node" ON "AiRun"("analysisId", "node", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Report_analysisId_key" ON "Report"("analysisId");
