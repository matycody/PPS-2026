-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "showAge" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showNickname" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showNumber" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showPhoto" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "city" VARCHAR(60),
ADD COLUMN     "foundedYear" INTEGER,
ADD COLUMN     "nickname" VARCHAR(40);
