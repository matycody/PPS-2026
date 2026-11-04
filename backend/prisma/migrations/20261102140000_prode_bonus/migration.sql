ALTER TABLE "Prediction" ADD COLUMN "pickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Prediction" ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "Prediction" ADD COLUMN "cuota" DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN "bonus" DOUBLE PRECISION;
-- las predicciones ya hechas parten de cuando se crearon
UPDATE "Prediction" SET "pickedAt" = "createdAt";
