/*
  Warnings:

  - Added the required column `branch` to the `Tournament` table without a default value. This is not possible if the table is not empty.
  - Added the required column `modality` to the `Tournament` table without a default value. This is not possible if the table is not empty.
  - Added the required column `year` to the `Tournament` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('LEAGUE', 'LEAGUE_CUP', 'CUP');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'FINISHED');

-- CreateEnum
CREATE TYPE "StageType" AS ENUM ('LEAGUE', 'KNOCKOUT');

-- CreateEnum
CREATE TYPE "TiebreakerCriterion" AS ENUM ('HEAD_TO_HEAD', 'SET_DIFFERENCE', 'SETS_WON', 'WINS', 'DRAW_LOT');

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "matchdayId" TEXT,
ADD COLUMN     "round" INTEGER,
ADD COLUMN     "slot" INTEGER,
ADD COLUMN     "stageId" TEXT;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "branch" "Branch" NOT NULL,
ADD COLUMN     "championId" TEXT,
ADD COLUMN     "edition" TEXT,
ADD COLUMN     "format" "TournamentFormat" NOT NULL DEFAULT 'LEAGUE',
ADD COLUMN     "modality" "Modality" NOT NULL,
ADD COLUMN     "pointsDraw" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "pointsLoss" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pointsWin" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "year" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "TournamentTeam" (
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "TournamentTeam_pkey" PRIMARY KEY ("tournamentId","teamId")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StageType" NOT NULL,
    "phase" INTEGER NOT NULL,
    "tier" INTEGER,
    "promotions" INTEGER NOT NULL DEFAULT 0,
    "relegations" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageTeam" (
    "stageId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seed" INTEGER,
    "entryRound" INTEGER,

    CONSTRAINT "StageTeam_pkey" PRIMARY KEY ("stageId","teamId")
);

-- CreateTable
CREATE TABLE "Matchday" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "date" TIMESTAMP(3),

    CONSTRAINT "Matchday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tiebreaker" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "criterion" "TiebreakerCriterion" NOT NULL,

    CONSTRAINT "Tiebreaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageStanding" (
    "stageId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "played" INTEGER NOT NULL,
    "won" INTEGER NOT NULL,
    "drawn" INTEGER NOT NULL,
    "lost" INTEGER NOT NULL,
    "setsFor" INTEGER NOT NULL,
    "setsAgainst" INTEGER NOT NULL,

    CONSTRAINT "StageStanding_pkey" PRIMARY KEY ("stageId","teamId")
);

-- CreateIndex
CREATE INDEX "TournamentTeam_teamId_idx" ON "TournamentTeam"("teamId");

-- CreateIndex
CREATE INDEX "Stage_tournamentId_idx" ON "Stage"("tournamentId");

-- CreateIndex
CREATE INDEX "StageTeam_teamId_idx" ON "StageTeam"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Matchday_stageId_number_key" ON "Matchday"("stageId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Tiebreaker_tournamentId_order_key" ON "Tiebreaker"("tournamentId", "order");

-- CreateIndex
CREATE INDEX "StageStanding_teamId_idx" ON "StageStanding"("teamId");

-- CreateIndex
CREATE INDEX "Match_stageId_idx" ON "Match"("stageId");

-- CreateIndex
CREATE INDEX "Match_matchdayId_idx" ON "Match"("matchdayId");

-- CreateIndex
CREATE INDEX "Tournament_year_idx" ON "Tournament"("year");

-- CreateIndex
CREATE INDEX "Tournament_status_idx" ON "Tournament"("status");

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_championId_fkey" FOREIGN KEY ("championId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_matchdayId_fkey" FOREIGN KEY ("matchdayId") REFERENCES "Matchday"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTeam" ADD CONSTRAINT "StageTeam_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTeam" ADD CONSTRAINT "StageTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchday" ADD CONSTRAINT "Matchday_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tiebreaker" ADD CONSTRAINT "Tiebreaker_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageStanding" ADD CONSTRAINT "StageStanding_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageStanding" ADD CONSTRAINT "StageStanding_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
