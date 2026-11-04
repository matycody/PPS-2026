CREATE TABLE "News" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(140) NOT NULL,
    "summary" VARCHAR(280),
    "body" TEXT NOT NULL,
    "imageUrl" VARCHAR(500),
    "teamId" TEXT,
    "authorId" TEXT NOT NULL,
    "authorName" VARCHAR(80) NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "News_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "News_publishedAt_idx" ON "News"("publishedAt");
CREATE INDEX "News_teamId_idx" ON "News"("teamId");

ALTER TABLE "News" ADD CONSTRAINT "News_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
