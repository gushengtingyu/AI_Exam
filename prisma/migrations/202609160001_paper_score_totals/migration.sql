-- 卷面分数口径：扫描读取的总分与卷面满分，用于报告展示与得分率分母
ALTER TABLE "Paper" ADD COLUMN "totalScore" REAL;
ALTER TABLE "Paper" ADD COLUMN "scannedMaxScore" REAL;
