-- Se limpia: las filas viejas no tienen los campos nuevos obligatorios (solo datos de prueba)
DELETE FROM "MatchResultLog";

/*
  Warnings:

  - You are about to drop the column `newValue` on the `MatchResultLog` table. All the data in the column will be lost.
  - You are about to drop the column `oldValue` on the `MatchResultLog` table. All the data in the column will be lost.
  - Added the required column `description` to the `MatchResultLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `editorLabel` to the `MatchResultLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `matchLabel` to the `MatchResultLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `MatchResultLog` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "MatchResultLog" DROP CONSTRAINT "MatchResultLog_editedBy_fkey";

-- DropForeignKey
ALTER TABLE "MatchResultLog" DROP CONSTRAINT "MatchResultLog_matchId_fkey";

-- AlterTable
ALTER TABLE "ClockAction" ADD COLUMN     "detail" TEXT;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "hiddenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MatchResultLog" DROP COLUMN "newValue",
DROP COLUMN "oldValue",
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "editorLabel" TEXT NOT NULL,
ADD COLUMN     "matchLabel" TEXT NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL;
