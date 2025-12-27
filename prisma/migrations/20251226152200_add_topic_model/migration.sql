/*
  Warnings:

  - The `status` column on the `quizzes` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('processing', 'processing_topics', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('pending', 'processing', 'ready', 'failed');

-- AlterTable
ALTER TABLE "quizzes" ALTER COLUMN "questions" DROP NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "QuizStatus" NOT NULL DEFAULT 'processing';

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "level" INTEGER NOT NULL,
    "parentId" TEXT,
    "content" JSONB NOT NULL,
    "tokenEstimate" INTEGER NOT NULL,
    "status" "TopicStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "topics_quizId_idx" ON "topics"("quizId");

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
