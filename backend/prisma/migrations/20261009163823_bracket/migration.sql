-- CreateEnum
CREATE TYPE "MatchSide" AS ENUM ('A', 'B');

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "loserMatchId" TEXT,
ADD COLUMN     "loserSide" "MatchSide",
ADD COLUMN     "nextMatchId" TEXT,
ADD COLUMN     "nextSide" "MatchSide";
