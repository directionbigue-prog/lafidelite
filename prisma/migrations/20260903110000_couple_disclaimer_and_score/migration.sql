-- AlterTable
ALTER TABLE "Couple" ADD COLUMN     "cumulativeCoupleScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "disclaimerAcceptedByCreatorAt" TIMESTAMP(3),
ADD COLUMN     "disclaimerAcceptedByPartnerAt" TIMESTAMP(3);

-- One IN_PROGRESS GameSession per couple at a time. GameSession.status
-- has no schema-level enum (String convention, see Global Constraints),
-- so this is a raw partial index Prisma's DSL cannot express.
CREATE UNIQUE INDEX "GameSession_couple_in_progress_unique"
  ON "GameSession"("coupleId") WHERE status = 'IN_PROGRESS';
