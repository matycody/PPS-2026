-- Horario opcional: solo se muestra la hora si la organización la cargó
ALTER TABLE "Match" ADD COLUMN "timeSet" BOOLEAN NOT NULL DEFAULT false;

-- Partidos existentes: tienen horario cargado salvo los que quedaron con la hora por defecto (12:00 de Argentina = 15:00 UTC)
UPDATE "Match" SET "timeSet" = true
WHERE "scheduledAt" IS NOT NULL
  AND NOT (EXTRACT(HOUR FROM "scheduledAt" AT TIME ZONE 'UTC') = 15 AND EXTRACT(MINUTE FROM "scheduledAt" AT TIME ZONE 'UTC') = 0);
