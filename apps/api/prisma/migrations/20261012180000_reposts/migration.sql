-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "previousSeenAt" TIMESTAMP(3),
ADD COLUMN     "repostCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "repostOfId" TEXT;

-- AlterTable
ALTER TABLE "ForgottenJob" ADD COLUMN     "fingerprint" TEXT;

-- CreateTable
CREATE TABLE "JobAlias" (
    "url" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobAlias_pkey" PRIMARY KEY ("url")
);

-- CreateTable
CREATE TABLE "MutedRepost" (
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MutedRepost_pkey" PRIMARY KEY ("fingerprint")
);

-- CreateIndex
CREATE INDEX "Job_fingerprint_idx" ON "Job"("fingerprint");

-- CreateIndex
CREATE INDEX "ForgottenJob_fingerprint_idx" ON "ForgottenJob"("fingerprint");

-- CreateIndex
CREATE INDEX "JobAlias_jobId_idx" ON "JobAlias"("jobId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_repostOfId_fkey" FOREIGN KEY ("repostOfId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAlias" ADD CONSTRAINT "JobAlias_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
