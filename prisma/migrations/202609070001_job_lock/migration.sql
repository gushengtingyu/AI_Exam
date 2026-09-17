ALTER TABLE "Job" ADD COLUMN "lockKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Job_lockKey_key" ON "Job"("lockKey");
