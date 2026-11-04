-- AlterTable
ALTER TABLE "User" ADD COLUMN "username" VARCHAR(20);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
