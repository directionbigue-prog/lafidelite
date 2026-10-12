-- ConnexionEvent : ce que la console d'administration sait des connexions.
--
-- ÉCRITE À LA MAIN, ET C'EST DÉLIBÉRÉ. `prisma migrate dev` compare la base
-- fantôme au schéma et génère un `DROP INDEX` pour les trois index uniques
-- PARTIELS que la DSL de Prisma ne sait pas déclarer —
-- `Couple_creator_active_unique`, `GameSession_couple_in_progress_unique` et
-- l'index « une partie par genre » du Salon. Accepter ces DROP retirerait en
-- silence les garanties « un seul couple actif » et « une seule partie en
-- cours », et rien n'échouerait avant que deux lignes existent. Cette
-- migration n'ajoute donc qu'une table et ses index, sans rien toucher
-- d'autre. Voir CLAUDE.md, « Couple-game invariants ».

CREATE TABLE "ConnexionEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "appareil" TEXT NOT NULL,
    "pays" TEXT,
    "methode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnexionEvent_pkey" PRIMARY KEY ("id")
);

-- Un index par vue de la console. `createdAt` est en seconde position partout
-- parce qu'aucune requête n'est non bornée dans le temps : la console regarde
-- 24 heures, 30 jours, 12 semaines, 12 mois ou 5 ans, jamais tout.
CREATE INDEX "ConnexionEvent_createdAt_idx" ON "ConnexionEvent"("createdAt");
CREATE INDEX "ConnexionEvent_appareil_createdAt_idx" ON "ConnexionEvent"("appareil", "createdAt");
CREATE INDEX "ConnexionEvent_pays_createdAt_idx" ON "ConnexionEvent"("pays", "createdAt");
CREATE INDEX "ConnexionEvent_userId_createdAt_idx" ON "ConnexionEvent"("userId", "createdAt");

-- ON DELETE CASCADE : supprimer un compte doit effacer ses traces de
-- connexion. ON UPDATE CASCADE suit la convention des autres clés de ce
-- schéma. La colonne est nullable, donc SET NULL serait ambigu — une ligne
-- orpheline se confondrait avec une connexion jamais rattachée.
ALTER TABLE "ConnexionEvent"
    ADD CONSTRAINT "ConnexionEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
