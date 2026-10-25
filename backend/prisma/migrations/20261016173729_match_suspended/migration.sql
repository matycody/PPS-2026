-- AlterEnum
ALTER TYPE "MatchStatus" ADD VALUE 'SUSPENDED';

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "originalScheduledAt" TIMESTAMP(3),
ADD COLUMN     "statusReason" TEXT;
