-- CreateIndex
CREATE INDEX "Match_scheduledAt_idx" ON "Match"("scheduledAt");

-- CreateIndex
CREATE INDEX "Match_teamAId_idx" ON "Match"("teamAId");

-- CreateIndex
CREATE INDEX "Match_teamBId_idx" ON "Match"("teamBId");

-- CreateIndex
CREATE INDEX "MatchAssignment_userId_idx" ON "MatchAssignment"("userId");

-- CreateIndex
CREATE INDEX "MatchAssignment_profileId_idx" ON "MatchAssignment"("profileId");

-- CreateIndex
CREATE INDEX "MatchAssignment_teamId_idx" ON "MatchAssignment"("teamId");
