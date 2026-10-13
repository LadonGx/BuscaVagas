-- CreateEnum
CREATE TYPE "InterviewCategory" AS ENUM ('hr', 'behavioral', 'technical', 'company');

-- CreateTable
CREATE TABLE "InterviewQuestion" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "category" "InterviewCategory" NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answer" TEXT,
    "starSituation" TEXT,
    "starTask" TEXT,
    "starAction" TEXT,
    "starResult" TEXT,
    "practiceCount" INTEGER NOT NULL DEFAULT 0,
    "lastRating" TEXT,
    "practicedAt" TIMESTAMP(3),
    "seeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewAsked" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "note" TEXT,
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewAsked_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewQuestion_category_idx" ON "InterviewQuestion"("category");

-- CreateIndex
CREATE INDEX "InterviewAsked_applicationId_idx" ON "InterviewAsked"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewAsked_questionId_applicationId_key" ON "InterviewAsked"("questionId", "applicationId");

-- AddForeignKey
ALTER TABLE "InterviewAsked" ADD CONSTRAINT "InterviewAsked_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InterviewQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewAsked" ADD CONSTRAINT "InterviewAsked_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
