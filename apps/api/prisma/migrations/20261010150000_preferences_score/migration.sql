-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "incompatible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "score" INTEGER,
ADD COLUMN     "scoreCoverage" INTEGER,
ADD COLUMN     "scoreReasons" JSONB,
ADD COLUMN     "scoredAt" TIMESTAMP(3),
ADD COLUMN     "scoredVersion" INTEGER;

-- CreateTable
CREATE TABLE "Preferences" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "stacksCore" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stacksPlus" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stacksAvoid" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seniorities" "SeniorityLevel"[] DEFAULT ARRAY[]::"SeniorityLevel"[],
    "workModels" "WorkModel"[] DEFAULT ARRAY[]::"WorkModel"[],
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contractTypes" "ContractType"[] DEFAULT ARRAY[]::"ContractType"[],
    "maxAgeDays" INTEGER,
    "minMonthlySalary" INTEGER,
    "blockedCompanies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_triage_score_idx" ON "Job"("triage", "score");

-- CreateIndex
CREATE INDEX "Job_scoredVersion_idx" ON "Job"("scoredVersion");
