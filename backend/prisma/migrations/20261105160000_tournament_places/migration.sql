-- CreateTable
CREATE TABLE "TournamentPlace" (
    "tournamentId" TEXT NOT NULL,
    "place" INTEGER NOT NULL,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "TournamentPlace_pkey" PRIMARY KEY ("tournamentId","place")
);

-- CreateIndex
CREATE INDEX "TournamentPlace_teamId_idx" ON "TournamentPlace"("teamId");

-- AddForeignKey
ALTER TABLE "TournamentPlace" ADD CONSTRAINT "TournamentPlace_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPlace" ADD CONSTRAINT "TournamentPlace_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
