-- CreateTable
CREATE TABLE "ForgottenJob" (
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "forgottenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForgottenJob_pkey" PRIMARY KEY ("url")
);

-- CreateIndex
CREATE INDEX "ForgottenJob_forgottenAt_idx" ON "ForgottenJob"("forgottenAt");
