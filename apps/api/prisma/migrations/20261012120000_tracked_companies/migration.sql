-- CreateTable
CREATE TABLE "TrackedCompany" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastJobs" INTEGER,
    "lastMatched" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemFlag" (
    "key" TEXT NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemFlag_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "TrackedCompany_source_active_idx" ON "TrackedCompany"("source", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedCompany_source_slug_key" ON "TrackedCompany"("source", "slug");
