-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "resumeSavedAt" TIMESTAMP(3),
ADD COLUMN     "resumeSnapshotId" TEXT;

-- CreateTable
CREATE TABLE "ResumeSnapshot" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationFile" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Application_resumeSnapshotId_idx" ON "Application"("resumeSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeSnapshot_hash_key" ON "ResumeSnapshot"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationFile_applicationId_key" ON "ApplicationFile"("applicationId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_resumeSnapshotId_fkey" FOREIGN KEY ("resumeSnapshotId") REFERENCES "ResumeSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationFile" ADD CONSTRAINT "ApplicationFile_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
