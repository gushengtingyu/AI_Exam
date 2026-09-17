-- 共用素材：多人同卷时试卷与权威答案只需上传一份
ALTER TABLE "PaperImage" ADD COLUMN "shared" BOOLEAN NOT NULL DEFAULT false;
