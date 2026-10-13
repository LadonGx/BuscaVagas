-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "board" TEXT,
ADD COLUMN     "checkReason" TEXT,
ADD COLUMN     "checkState" TEXT,
ADD COLUMN     "checkedAt" TIMESTAMP(3),
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedReason" TEXT,
ADD COLUMN     "deadline" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Job_source_board_idx" ON "Job"("source", "board");

-- CreateIndex
CREATE INDEX "Job_closedAt_idx" ON "Job"("closedAt");
