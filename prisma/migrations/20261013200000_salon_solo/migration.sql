-- Le Salon s'ouvre aux comptes sans partenaire.
--
-- ÉCRITE À LA MAIN, comme `20261013000000_reponse_du_jour` et pour la même
-- raison : `prisma migrate dev` générerait au passage un `DROP INDEX` pour les
-- index uniques PARTIELS que la DSL de Prisma ne sait pas déclarer. Voir
-- CLAUDE.md, « Couple-game invariants ».
--
-- Une partie appartient désormais au couple OU à un compte seul. Les parties
-- existantes ont toutes un `coupleId` : elles satisfont la contrainte telles
-- quelles, rien n'est réécrit.

ALTER TABLE "BoardGame" ALTER COLUMN "coupleId" DROP NOT NULL;
ALTER TABLE "BoardGame" ADD COLUMN "userId" TEXT;

ALTER TABLE "BoardGame" ADD CONSTRAINT "BoardGame_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "BoardGame_userId_kind_status_idx" ON "BoardGame"("userId", "kind", "status");

-- Exactement un propriétaire. Sans cette contrainte, une ligne sans aucun des
-- deux serait lue par personne, et une ligne avec les deux serait lue par le
-- couple ET par le compte seul.
ALTER TABLE "BoardGame" ADD CONSTRAINT "BoardGame_un_seul_proprietaire"
    CHECK (("coupleId" IS NULL) <> ("userId" IS NULL));

-- Une seule partie en cours par compte seul et par jeu — le pendant de
-- `BoardGame_couple_kind_in_progress_unique`. Les lignes de couple ont un
-- `userId` NULL, et Postgres tient les NULL pour distincts : les deux index
-- ne se gênent pas.
CREATE UNIQUE INDEX "BoardGame_user_kind_in_progress_unique"
    ON "BoardGame"("userId", "kind") WHERE status = 'IN_PROGRESS';
