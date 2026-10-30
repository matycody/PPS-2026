-- Línea de tiempo del marcador: cuándo se decidió cada set (tiempo y segundos jugados)
ALTER TABLE "MatchSet" ADD COLUMN "half" INTEGER,
ADD COLUMN "matchSecond" INTEGER,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
