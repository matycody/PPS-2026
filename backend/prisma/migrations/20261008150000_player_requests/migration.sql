-- CreateEnum
CREATE TYPE "PlayerRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "PlayerRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "sex" "Sex" NOT NULL,
    "number" INTEGER,
    "status" "PlayerRequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerRequestTeam" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "branch" "Branch" NOT NULL,

    CONSTRAINT "PlayerRequestTeam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerRequest_status_idx" ON "PlayerRequest"("status");

-- CreateIndex
CREATE INDEX "PlayerRequest_userId_idx" ON "PlayerRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRequestTeam_requestId_branch_key" ON "PlayerRequestTeam"("requestId", "branch");

-- AddForeignKey
ALTER TABLE "PlayerRequest" ADD CONSTRAINT "PlayerRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRequestTeam" ADD CONSTRAINT "PlayerRequestTeam_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PlayerRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRequestTeam" ADD CONSTRAINT "PlayerRequestTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PlayerRequest_one_pending" ON "PlayerRequest"("userId") WHERE "status" = 'PENDING';
