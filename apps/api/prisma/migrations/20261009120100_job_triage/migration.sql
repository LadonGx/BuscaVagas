-- CreateEnum
CREATE TYPE "TriageStatus" AS ENUM ('inbox', 'saved', 'dismissed');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "dismissReason" TEXT,
ADD COLUMN     "triage" "TriageStatus" NOT NULL DEFAULT 'inbox',
ADD COLUMN     "triagedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Job_triage_firstSeenAt_idx" ON "Job"("triage", "firstSeenAt");
