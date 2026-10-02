/*
  Warnings:

  - A unique constraint covering the columns `[matchId,teamId]` on the table `MatchAssignment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "MatchAssignment" ADD COLUMN     "teamId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MatchAssignment_matchId_teamId_key" ON "MatchAssignment"("matchId", "teamId");

-- AddForeignKey
ALTER TABLE "MatchAssignment" ADD CONSTRAINT "MatchAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
