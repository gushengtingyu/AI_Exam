ALTER TABLE "Analysis" ADD COLUMN "clientRequestId" TEXT;
CREATE UNIQUE INDEX "Analysis_clientRequestId_key" ON "Analysis"("clientRequestId");

ALTER TABLE "PaperImage" ADD COLUMN "uploadRequestId" TEXT;
CREATE UNIQUE INDEX "PaperImage_uploadRequestId_key" ON "PaperImage"("uploadRequestId");
