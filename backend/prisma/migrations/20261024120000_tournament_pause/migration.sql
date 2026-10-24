-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "pausedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Match" ADD COLUMN "hiddenByPause" BOOLEAN NOT NULL DEFAULT false;
