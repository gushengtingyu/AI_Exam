ALTER TABLE "Job" ADD COLUMN "runToken" TEXT;
ALTER TABLE "Analysis" ADD COLUMN "activeRunToken" TEXT;

CREATE INDEX IF NOT EXISTS "idx_job_run_token" ON "Job"("runToken");
CREATE INDEX IF NOT EXISTS "idx_analysis_active_run_token" ON "Analysis"("activeRunToken");
