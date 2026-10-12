# Divertissements — le jeu de dames — design

Date : 2026-09-08
Statut : Approuvé (brainstorming)
Périmètre : premier jeu d'une rubrique « Divertissement » complémentaire au
moteur de couple. Le ludo et le jeu de mots suivront, chacun avec sa propre
spec.

## Contexte

Cœur Fidèle est un jeu de couple pass-and-play : trois manches, un moteur de
score, un niveau de complicité cumulé entre les parties. L'utilisateur
demande d'y ajouter des jeux simples « en complémentaires », à visée de
**divertissement**.

Trois jeux ont été évoqués : un jeu de mots type Scrabble, les dames, le
ludo. Ce sont trois moteurs de règles indépendants, de tailles très
inégales — le jeu de mots pèse à lui seul plusieurs fois les deux autres
réunis (dictionnaire français, validation de tous les mots croisés formés,
sac de lettres pondéré). Les mener de front produirait trois moteurs à
moitié finis. **On en livre un, complet, et il sert de socle aux suivants.**

Décision : on commence par **les dames**, le plus petit moteur des trois et
le plus proche de ce qui existe déjà (deux joueurs, tour par tour, un seul
appareil qu'on se passe).

Note sur le jeu de mots, pour mémoire : le nom *Scrabble* et le dessin du
plateau appartiennent à Mattel/Hasbro. Le jeu sera réalisable sous un autre
nom, avec une disposition de primes différente et un dictionnaire français
libre. Ce n'est pas un obstacle, seulement une contrainte de nommage à
retenir pour sa propre spec.

## Décisions produit

- **Règles** : dames internationales 10×10 (standard au Sénégal, en France
  et en Afrique de l'Ouest). Prise obligatoire, en avant comme en arrière,
  enchaînée, au maximum de pions ; dame volante.
- **Adversaire** : à deux, sur le même appareil. Aucune IA dans ce lot.
- **Accès** : connecté, en couple actif, **gratuit et illimité**. Ne
  consomme jamais la partie offerte (`User.freeGameUsedAt`) ni de points.
- **Étanchéité au moteur de couple** : une partie de dames ne touche
  **jamais** à `Couple.cumulativeCoupleScore`, à `GameResult`, ni au niveau
  de complicité. Gagner aux dames ne dit rien de la complicité d'un couple ;
  y injecter des points viderait le niveau de son sens. Aucune écriture
  croisée entre les deux domaines, dans aucun sens.

## Décision d'architecture : le moteur tourne dans le navigateur

Le jeu principal valide chaque réponse côté serveur. C'est justifié là-bas :
il y a de l'information cachée (la réponse du partenaire avant la
révélation, le poids des scénarios) et un score réel.

Les dames n'ont ni l'un ni l'autre. Deux joueurs, un seul appareil, une
seule session authentifiée, un plateau entièrement visible des deux côtés,
et aucun score qui compte. Valider chaque coup sur le serveur ne
protégerait de rien : les deux joueurs déplacent déjà les pièces des deux
camps. Cela coûterait en revanche un aller-retour réseau par coup, sur une
partie qui en compte 50 à 100 (plancher mesuré : ~320 ms par requête, voir
`docs/notes/latence-base-de-donnees.md`).

**Donc : moteur de règles pur exécuté côté client ; le serveur ne fait que
conserver le plateau**, pour qu'une partie survive à un onglet fermé. La
sauvegarde part en tâche de fond après chaque coup et ne bloque jamais le
jeu.

L'état stocké n'a aucune valeur : quelqu'un qui le trafiquerait obtiendrait
un plateau qu'il pouvait déjà se fabriquer à la main en jouant les deux
camps. Le serveur valide donc la **forme** de l'état (voir §Routes), jamais
la légalité des coups.

Le moteur reste un module pur — sans Prisma, sans DOM, sans React — comme
`lib/server/game/scoring.ts`. Il est donc entièrement testable, et
réutilisable tel quel le jour où l'on voudra une IA ou un mode deux
appareils.

## Le moteur — `frontend/src/lib/dames/`

### Représentation

Notation officielle FMJD : seules les 50 cases sombres sont jouables,
numérotées 1 à 50, de gauche à droite et de haut en bas.

L'état est un tableau de 50 entrées (index `i` = case `i+1`), chacune `null`
ou `{ camp, dame }`.

Géométrie, pour la case d'index `i` :

```
rangee  = Math.floor(i / 5)                        // 0-9
colonne = 2 * (i % 5) + (rangee % 2 === 0 ? 1 : 0)
```

La case 1 (rangée 0, colonne 1) a donc pour voisines en descendant les cases
6 et 7 — ce qui correspond aux tables publiées, et sert de premier test de
la géométrie.

Position de départ, conforme au standard : les **noirs** occupent les cases
1–20 et descendent, les **blancs** occupent les cases 31–50 et montent. Les
blancs ouvrent.

L'état complet manipulé par le moteur est `{ cases, trait }` — les 50 cases
et le camp au trait. `moveCount` n'en fait pas partie : c'est un compteur de
persistance, porté par sa propre colonne (voir §Routes).

**Le moteur parle « blanc » et « noir »**, comme toute la littérature et
tous les jeux de référence du domaine. Ce n'est pas un détail de style :
c'est ce qui permet de confronter directement le générateur de coups aux
valeurs publiées. L'interface, elle, ne montre jamais ces mots — elle
affiche les prénoms des deux partenaires et deux couleurs de la palette.

### Génération des coups — `coupsLegaux(etat): Coup[]`

Un `Coup` porte : case de départ, case d'arrivée, cases capturées, et les
paliers intermédiaires (nécessaires à l'animation et à la notation).

1. Générer récursivement **toutes les séquences de prise** du camp au trait.
2. S'il en existe → les coups légaux sont **celles qui capturent le plus de
   pions**, et elles seules.
3. Sinon → les déplacements simples.

Trois règles font échouer la quasi-totalité des implémentations amateur.
Elles sont traitées en premier, et chacune a son test :

- **La rafle maximale.** On ne peut pas décider de la légalité d'une prise
  sans avoir exploré tout l'arbre des prises. La règle compte le **nombre de
  pièces**, pas leur valeur : aux dames internationales, une dame ne vaut
  pas plus qu'un pion dans le décompte (c'est la variante italienne qui
  privilégie la dame — piège classique).
- **Les pions pris restent sur le plateau** jusqu'à la fin de la rafle, à
  l'état « capturé ». Ils bloquent le passage, ce qui interdit de sauter
  deux fois la même pièce.
- **Un pion qui traverse la dernière rangée sans s'y arrêter n'est pas
  promu.** La promotion est décidée à la fin du coup, sur la case d'arrivée
  seulement.

La dame volante glisse sur la diagonale, franchit **exactement une** pièce
adverse non encore capturée, et peut se poser sur **n'importe quelle** case
libre au-delà — chaque atterrissage ouvrant une continuation différente.
L'exploration branche donc sur les cases d'arrivée, pas seulement sur les
pièces prises.

**Quatrième règle, découverte à la vérification** (voir §Tests) : deux
rafles qui partent de la même case, arrivent sur la même case et capturent
exactement **le même ensemble** de pièces sont **le même coup**, même si
l'ordre des prises diffère. Elles doivent être dédupliquées. Les doublons
naissent de deux sources distinctes : la permutation de l'ordre des prises
dans une rafle qui revient sur son point de départ, et le choix de la case
d'atterrissage d'une dame volante. La seconde en produit dès **deux**
captures — position vérifiée sur le moteur : dame en 1, pions en 7 et 23.
C'est précisément l'écart qui sépare deux générateurs de référence sur le
forum de la fédération, au perft(8). Sans déduplication, l'interface
proposerait au joueur deux destinations identiques et indiscernables.

### Application et fin de partie

`appliquer(etat, coup)` retourne un nouvel état : pièce déplacée, pièces
capturées retirées, promotion évaluée sur la case d'arrivée, trait passé à
l'autre camp.

`issue(etat)` : le camp au trait qui n'a **aucun coup légal** — plus de
pièces, ou toutes bloquées — a perdu.

**Non implémenté, délibérément** : la règle des 25 coups (nulle automatique
dans les finales de dames). Elle demande de compter les coups sans prise ni
mouvement de pion, pour un cas de figure que deux joueurs assis côte à côte
règlent en se mettant d'accord. Une nulle **par accord** est proposée à la
place, et l'abandon reste toujours disponible.

## Persistance

Nouveau modèle, volontairement générique pour accueillir le ludo et le jeu
de mots sans nouvelle migration :

```prisma
model BoardGame {
  id        String    @id @default(cuid())
  coupleId  String
  couple    Couple    @relation(fields: [coupleId], references: [id], onDelete: Cascade)
  kind      String    // DAMES  (LUDO, MOTS à venir)
  status    String    @default("IN_PROGRESS") // IN_PROGRESS | COMPLETED | ABANDONED
  state     Json      // opaque au serveur — voir la décision d'architecture
  moveCount Int       @default(0)
  startedAt DateTime  @default(now())
  endedAt   DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([coupleId, kind, status])
}
```

`Couple` gagne la relation inverse `boardGames BoardGame[]`.

Index unique partiel en SQL brut — même motif que
`GameSession_couple_in_progress_unique` — pour interdire deux parties
simultanées du même jeu pour le même couple :

```sql
CREATE UNIQUE INDEX "BoardGame_couple_kind_in_progress_unique"
  ON "BoardGame"("coupleId", "kind") WHERE status = 'IN_PROGRESS';
```

## Routes — `/api/salon`

Toutes : `export const runtime = 'nodejs'`, `makeRequestContext` /
`withRequestContext`, `requireAuth`, `verifyCsrf(req)` sur les mutations,
couple résolu par la variante stricte `ACTIVE`, et **404** (jamais 403) si
la partie n'appartient pas au couple de l'appelant — motif déjà établi dans
le dépôt.

| Route | Méthode | Contrat |
|---|---|---|
| `/api/salon` | POST | `{ kind }`. Idempotent : renvoie la partie `IN_PROGRESS` existante si elle existe, sinon en crée une à la position de départ. |
| `/api/salon/current` | GET | `?kind=DAMES` → la partie en cours, ou `{ game: null }`. |
| `/api/salon/[id]/state` | PUT | `{ state, moveCount }`. Sauvegarde le plateau. |
| `/api/salon/[id]/end` | POST | `{ outcome }` — `COMPLETED` ou `ABANDONED`. |

Deux gardes portent tout le poids :

- **`moveCount` doit être strictement supérieur à celui enregistré**, sinon
  la requête est refusée sans effet. C'est le seul vrai risque de la
  sauvegarde en tâche de fond : deux requêtes parties coup sur coup peuvent
  arriver dans le désordre, et une sauvegarde en retard écraserait un
  plateau plus récent. La garde est monotone, donc l'ordre d'arrivée cesse
  de compter.
- **Validation Zod de la _forme_ de `state`** à l'écriture : exactement 50
  cases, chacune `null` ou `{ camp, dame }` avec un camp connu, plus un
  trait valide ; et `moveCount` entier positif dans le corps de la requête.
  C'est une garde contre un état corrompu qui ferait planter la reprise,
  **pas** une vérification de légalité — la distinction est délibérée et
  doit rester documentée dans le fichier de route.

## Écrans

Le canevas de design (renvoyé le 2026-09-08) a été mis à jour et couvre
désormais cette rubrique. **Il fait foi pour l'écran ; la présente spec fait
foi pour les règles.** Ce qui suit en est repris ; ce qui en est écarté est
dit plus bas, avec la raison.

**`/salon`** — « Le Salon ». Le nom vient du canevas, et la maquette web
montre l'URL en clair dans sa barre d'adresse (`coeurfidele.com/salon`).
Quatre jeux y figurent — **jeu de dames**, **ludo**, **mots croisés** et
**awalé** — dont un seul est jouable dans ce lot. Les trois autres sont
annoncés **sans être des liens** : le dépôt a un test qui échoue sur tout
lien interne mort, et une navigation qui ment sur ce qui existe est pire
qu'une navigation courte.

La phrase d'accroche est celle du canevas, mot pour mot, parce qu'elle
formule l'étanchéité mieux qu'un commentaire :

> Des parties plus légères, entre deux Cœur Fidèle. Elles ne comptent pas
> dans votre Score de Fidélité — c'est le seul endroit de l'app où il y a un
> gagnant.

Une entrée « Le Salon » rejoint la barre latérale de `AppShell` — légitime
désormais, puisqu'il y a une page derrière (voir le commentaire en tête du
composant : « ajouter l'entrée avec la route, pas avant »).

**`/salon/dames`** — le plateau, sur fond **crème**, comme le dessine le
canevas. Le dépôt sait déjà faire ce fond : `FocusLayout` accepte
`ground="cream"`, introduit pour la manche Scénarios. On le réutilise plutôt
que d'en inventer un quatrième. Pas de barre latérale ici, un simple retour
« ← Salon » : pendant une partie, le plateau est la seule chose qui doit
demander l'attention.

- Damier 10×10 aux couleurs relevées dans le canevas : cases jouables
  `#3D2036`, cases inertes `#EFE3D6`. Les deux teintes entrent **une fois**
  comme tokens Tailwind (`damier.clair`, `damier.fonce`) — le dépôt proscrit
  l'hexadécimal dans le JSX.
- Les deux camps s'opposent en **crème bordé de prune** et en **wine bordé
  de crème**, toujours d'après le canevas.
- Une dame porte un anneau intérieur de la couleur adverse, et un nom
  accessible qui la distingue d'un pion.
- **Le coup se valide, il ne se joue pas d'un doigt.** Le canevas montre
  « Valider le coup » et « Annuler », et ce n'est pas cosmétique : avec la
  prise obligatoire et les rafles à plusieurs sauts, voir la séquence
  entière avant de s'y engager est la moitié de l'ergonomie. La logique
  d'interaction n'en est pas changée — elle signale déjà qu'un coup est
  complet ; c'est l'écran qui le retient au lieu de l'appliquer.
- Jouer : on touche une pièce, ses destinations légales s'affichent ; on
  touche une destination. Dans une rafle, seules les continuations de la
  séquence en cours sont proposées après chaque palier, et « Valider le
  coup » ne s'active qu'une fois la séquence achevée.
- Le trait est annoncé avec le vrai prénom : « À Awa de jouer ».
- Le canevas affiche un score de manches (« 7 — 5 »). Rien ne compte les
  manches gagnées, donc il est remplacé par un chiffre vrai : les pièces
  restantes de chaque camp.
- **Quand une prise est obligatoire ailleurs**, toucher une pièce qui n'a
  aucun coup légal affiche « La prise est obligatoire » au lieu de ne rien
  faire. C'est la règle qui surprend le plus, et un plateau muet ressemble
  alors à un bug.
- Accessibilité : le plateau est une grille (`role="grid"`), chaque case
  jouable est un bouton portant un nom du type « case 32, pion or ». La
  partie est jouable au clavier.
- Mobile (390 px) : plateau ~350 px, soit des cases de 35 px. C'est en
  dessous de la cible tactile de 48 px habituelle du dépôt, et c'est
  inévitable — sur un damier, la case _est_ la cible. Écart assumé et
  documenté.

## Tests

Le moteur est pur, donc entièrement couvert par Vitest (environnement
`node`, comme le reste du dépôt) :

- **Géométrie** : aller-retour case ↔ coordonnées sur les 50 cases, et
  voisinages de cases connues.
- **Position de départ** et ses 9 coups d'ouverture.
- **Perft** — le test qui décide de tout. Il compte toutes les séquences
  légales jusqu'à une profondeur donnée depuis la position initiale. Un
  générateur qui dévie d'une seule unité a une règle fausse.

  Les valeurs ont été **relevées sur une source publiée** avant l'écriture
  du plan, et non de mémoire : elles proviennent d'Ed Gilbert (auteur de
  *Kingsrow*, moteur de référence), sur le forum de la fédération mondiale
  — <https://damforum.nl/viewtopic.php?t=2308>.

  | Profondeur | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
  |---|---|---|---|---|---|---|---|
  | Nœuds | 9 | 81 | 658 | 4 265 | 27 117 | 167 140 | 1 049 442 |

  C'est ce même fil qui a révélé la règle de déduplication des rafles : deux
  générateurs y divergent à partir de la profondeur 8, et l'auteur du second
  en identifie la cause — son générateur ne dédupliquait pas les rafles
  différant seulement par l'ordre des prises.
- **Rafle maximale** : position où une prise à 1 et une prise à 3 coexistent
  — seule celle à 3 est légale.
- **Pas de double saut** sur la même pièce dans une rafle.
- **Promotion** : un pion qui traverse la dernière rangée en cours de rafle
  et repart n'est pas promu ; le même pion qui s'y arrête l'est.
- **Dame volante** : toutes les cases d'atterrissage sont générées, et
  chacune ouvre bien ses continuations propres.
- **Fin de partie** : camp bloqué mais non capturé = défaite.

Côté serveur, tests de routes sur le modèle de
`app/api/couples/route.test.ts`, avec un test dédié à la garde monotone sur
`moveCount` (une sauvegarde en retard ne doit rien écraser).

## Hors périmètre

Explicitement exclus de ce lot, et à ne pas anticiper dans le code :

- toute IA / mode solo ;
- le mode deux appareils (Ably) ;
- le ludo, les mots croisés et l'awalé ;
- la nulle automatique par la règle des 25 coups ;
- un historique des parties ou un palmarès ;
- tout lien, dans un sens comme dans l'autre, avec
  `cumulativeCoupleScore`, `GameResult` ou le niveau de complicité.

### Ce que le canevas montre et que ce lot ne construit pas

Chaque fois pour la même raison : ce sur quoi ça repose n'existe pas
encore, et l'afficher serait annoncer ce que le produit ne fait pas.

- **Le damier 8×8** du canevas. Il dessine des dames anglaises (12 pions par
  camp) ; les règles retenues sont les internationales 10×10 (20 pions).
  Arbitrage explicite de l'utilisateur, le 2026-09-08 : le dessin cède, la
  règle tient. L'écran est adapté au 10×10.
- **Les prix en points** (« 10 pts la partie », « Dames · 10 pts », le solde
  commun de la barre latérale). L'économie de points n'existe pas en base.
  La colonne du canevas est conservée à sa place et porte « Offert ».
- **« Tournoi du couple »** — *trois victoires d'affilée au Salon et votre
  prochaine partie Cœur Fidèle est offerte*. Il faudrait compter les
  victoires, et accorder une partie gratuite : deux mécaniques absentes.
- **La présence et la reconnexion** — « Malick vous attend au Ludo »,
  « Rejoindre la table », l'écran *Attente & reconnexion*. C'est le mode
  deux appareils, lot séparé.
