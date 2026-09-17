-- Add generated practice questions to each analyzed question.
ALTER TABLE "Question" ADD COLUMN "aiPracticeQuestions" JSONB NOT NULL DEFAULT '[]';
