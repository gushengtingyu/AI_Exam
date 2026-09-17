-- 节点级缓存：相同输入（含指令摘要）的已成功调用可供重跑复用
ALTER TABLE "AiRun" ADD COLUMN "inputHash" TEXT;
CREATE INDEX IF NOT EXISTS "idx_ai_run_cache" ON "AiRun"("analysisId", "node", "inputHash");
