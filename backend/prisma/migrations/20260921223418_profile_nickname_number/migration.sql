-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "nickname" VARCHAR(30),
ADD COLUMN     "number" INTEGER;

-- Número de camiseta: entero de 0 a 999
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_number_range" CHECK ("number" IS NULL OR ("number" >= 0 AND "number" <= 999));
