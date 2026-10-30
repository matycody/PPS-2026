-- Sedes (polideportivos) y sede de cada partido
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "address" VARCHAR(160) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "mapUrl" VARCHAR(300),
    "courts" INTEGER,
    "notes" VARCHAR(300),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Venue_deletedAt_idx" ON "Venue"("deletedAt");

ALTER TABLE "Match" ADD COLUMN "venueId" TEXT;

CREATE INDEX "Match_venueId_idx" ON "Match"("venueId");

ALTER TABLE "Match" ADD CONSTRAINT "Match_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
