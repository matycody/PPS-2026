-- CreateTable
CREATE TABLE "TeamPenalty" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "missing" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason" VARCHAR(200),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamPenalty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamPenalty_stageId_idx" ON "TeamPenalty"("stageId");

-- CreateIndex
CREATE INDEX "TeamPenalty_teamId_idx" ON "TeamPenalty"("teamId");

-- AddForeignKey
ALTER TABLE "TeamPenalty" ADD CONSTRAINT "TeamPenalty_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPenalty" ADD CONSTRAINT "TeamPenalty_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
