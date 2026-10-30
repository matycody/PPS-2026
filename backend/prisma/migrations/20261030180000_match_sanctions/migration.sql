-- Sanciones de partido: advertencias, amarilla, azul y roja
CREATE TYPE "SanctionKind" AS ENUM ('WARNING', 'YELLOW', 'BLUE', 'RED');

CREATE TABLE "MatchSanction" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "side" "MatchSide" NOT NULL,
    "profileId" TEXT,
    "kind" "SanctionKind" NOT NULL,
    "eliminates" BOOLEAN NOT NULL DEFAULT false,
    "reason" VARCHAR(200),
    "half" INTEGER,
    "setNumber" INTEGER,
    "matchSecond" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "MatchSanction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MatchSanction_matchId_idx" ON "MatchSanction"("matchId");
CREATE INDEX "MatchSanction_profileId_idx" ON "MatchSanction"("profileId");

ALTER TABLE "MatchSanction" ADD CONSTRAINT "MatchSanction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchSanction" ADD CONSTRAINT "MatchSanction_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
