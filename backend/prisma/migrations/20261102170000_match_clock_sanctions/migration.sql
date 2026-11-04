-- AlterTable
ALTER TABLE "MatchClock" ADD COLUMN "matchEnded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sanctions" JSONB NOT NULL DEFAULT '[]';
