-- CreateTable "Couple"
CREATE TABLE "Couple" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "creatorId" TEXT NOT NULL,
    "partnerId" TEXT,
    "inviteCode" TEXT NOT NULL,
    "inviteExpiresAt" TIMESTAMP(3) NOT NULL,
    "pairedAt" TIMESTAMP(3),
    "dissolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Couple_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Couple_inviteCode_key" ON "Couple"("inviteCode");

-- CreateIndex
CREATE INDEX "Couple_creatorId_idx" ON "Couple"("creatorId");

-- CreateIndex
CREATE INDEX "Couple_partnerId_idx" ON "Couple"("partnerId");

-- CreateIndex
CREATE INDEX "Couple_inviteCode_idx" ON "Couple"("inviteCode");

-- AddForeignKey
ALTER TABLE "Couple" ADD CONSTRAINT "Couple_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Couple" ADD CONSTRAINT "Couple_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
