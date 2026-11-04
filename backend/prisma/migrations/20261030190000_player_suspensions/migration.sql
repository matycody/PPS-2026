CREATE TABLE "PlayerSuspension" (
    "id" TEXT NOT NULL,
    "sanctionId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "fechas" INTEGER NOT NULL DEFAULT 0,
    "sameDay" BOOLEAN NOT NULL DEFAULT false,
    "note" VARCHAR(300),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PlayerSuspension_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerSuspension_sanctionId_key" ON "PlayerSuspension"("sanctionId");
CREATE INDEX "PlayerSuspension_profileId_idx" ON "PlayerSuspension"("profileId");

ALTER TABLE "PlayerSuspension" ADD CONSTRAINT "PlayerSuspension_sanctionId_fkey" FOREIGN KEY ("sanctionId") REFERENCES "MatchSanction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerSuspension" ADD CONSTRAINT "PlayerSuspension_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
