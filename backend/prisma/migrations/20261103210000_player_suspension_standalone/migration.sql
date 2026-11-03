-- Sanciones a jugadores sin partido (de torneo): la suspensión ya no necesita una roja
ALTER TABLE "PlayerSuspension" ALTER COLUMN "sanctionId" DROP NOT NULL;
ALTER TABLE "PlayerSuspension" ADD COLUMN "tournamentId" TEXT;
ALTER TABLE "PlayerSuspension" ADD COLUMN "modality" "Modality";
ALTER TABLE "PlayerSuspension" ADD COLUMN "reason" VARCHAR(200);
ALTER TABLE "PlayerSuspension" ADD COLUMN "sourceAt" TIMESTAMP(3);
CREATE INDEX "PlayerSuspension_tournamentId_idx" ON "PlayerSuspension"("tournamentId");
