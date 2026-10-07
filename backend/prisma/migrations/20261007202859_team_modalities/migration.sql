-- CreateTable
CREATE TABLE "TeamModality" (
    "teamId" TEXT NOT NULL,
    "modality" "Modality" NOT NULL,

    CONSTRAINT "TeamModality_pkey" PRIMARY KEY ("teamId","modality")
);

-- AddForeignKey
ALTER TABLE "TeamModality" ADD CONSTRAINT "TeamModality_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
