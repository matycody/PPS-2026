-- CreateTable
CREATE TABLE "MatchClock" (
    "matchId" TEXT NOT NULL,
    "matchTimeLeft" INTEGER NOT NULL,
    "setTimeLeft" INTEGER NOT NULL,
    "timeoutTimeLeft" INTEGER NOT NULL,
    "isMatchPaused" BOOLEAN NOT NULL,
    "isSetPaused" BOOLEAN NOT NULL,
    "isTimeoutRunning" BOOLEAN NOT NULL,
    "matchHalf" INTEGER NOT NULL DEFAULT 1,
    "clothAutoResetUsed" BOOLEAN NOT NULL DEFAULT false,
    "timeoutTeam" TEXT,
    "timeoutHalf" INTEGER,
    "timeoutsUsed" JSONB NOT NULL,
    "resumeAfterTimeout" JSONB NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchClock_pkey" PRIMARY KEY ("matchId")
);

-- AddForeignKey
ALTER TABLE "MatchClock" ADD CONSTRAINT "MatchClock_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
