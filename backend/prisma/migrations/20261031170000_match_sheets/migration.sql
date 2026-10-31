CREATE TABLE "MatchSheet" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "kind" VARCHAR(8) NOT NULL DEFAULT 'PRE',
    "imagePath" TEXT NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "mime" VARCHAR(30) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" VARCHAR(20),
    "aiModel" VARCHAR(60),
    "extracted" JSONB,
    "aiError" VARCHAR(300),
    "confirmed" JSONB,
    "status" VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "MatchSheet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MatchSheet_matchId_uploadedAt_idx" ON "MatchSheet"("matchId", "uploadedAt");

CREATE TABLE "MatchAttendance" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL,
    "sheetId" TEXT NOT NULL,

    CONSTRAINT "MatchAttendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatchAttendance_matchId_profileId_key" ON "MatchAttendance"("matchId", "profileId");
CREATE INDEX "MatchAttendance_matchId_idx" ON "MatchAttendance"("matchId");
