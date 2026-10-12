-- Divertissements : une table pour tous les jeux de plateau.
CREATE TABLE "BoardGame" (
    "id" TEXT NOT NULL,
    "coupleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "state" JSONB NOT NULL,
    "moveCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardGame_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoardGame_coupleId_kind_status_idx" ON "BoardGame"("coupleId", "kind", "status");

ALTER TABLE "BoardGame" ADD CONSTRAINT "BoardGame_coupleId_fkey"
    FOREIGN KEY ("coupleId") REFERENCES "Couple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Une seule partie en cours par couple et par jeu.
--
-- Index unique PARTIEL : un couple peut avoir dix parties de dames
-- terminées et une en cours, mais jamais deux en cours. Le DSL de Prisma
-- ne sait pas exprimer la clause WHERE — d'où le SQL brut, comme pour
-- Couple_creator_active_unique et GameSession_couple_in_progress_unique.
CREATE UNIQUE INDEX "BoardGame_couple_kind_in_progress_unique"
    ON "BoardGame"("coupleId", "kind") WHERE status = 'IN_PROGRESS';
