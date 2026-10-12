-- ReponseDuJour : le rituel de la question du jour.
--
-- ÉCRITE À LA MAIN, comme `20261002200000_connexion_event` et pour la même
-- raison : `prisma migrate dev` générerait au passage un `DROP INDEX` pour les
-- trois index uniques PARTIELS que la DSL de Prisma ne sait pas déclarer
-- (`Couple_creator_active_unique`, `GameSession_couple_in_progress_unique` et
-- l'index « une partie par genre » du Salon). Cette migration n'ajoute qu'une
-- table et ses index. Voir CLAUDE.md, « Couple-game invariants ».

CREATE TABLE "ReponseDuJour" (
    "id" TEXT NOT NULL,
    "coupleId" TEXT NOT NULL,
    "jour" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "choixPropre" TEXT NOT NULL,
    "choixDevine" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReponseDuJour_pkey" PRIMARY KEY ("id")
);

-- Une réponse par partenaire et par jour : c'est cet index qui refuse une
-- double soumission (P2002 → 409 DEJA_REPONDU), pas un contrôle applicatif.
CREATE UNIQUE INDEX "ReponseDuJour_coupleId_jour_role_key" ON "ReponseDuJour"("coupleId", "jour", "role");
CREATE INDEX "ReponseDuJour_coupleId_jour_idx" ON "ReponseDuJour"("coupleId", "jour");

ALTER TABLE "ReponseDuJour"
    ADD CONSTRAINT "ReponseDuJour_coupleId_fkey"
    FOREIGN KEY ("coupleId") REFERENCES "Couple"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT, comme `GameRoundQuestion` : une question déjà posée ne disparaît
-- pas de la banque, on la désactive (`active = false`).
ALTER TABLE "ReponseDuJour"
    ADD CONSTRAINT "ReponseDuJour_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "Question"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
