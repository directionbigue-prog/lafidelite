# L'Awalé — deuxième jeu du Salon

**Décidé avec l'utilisateur le 2026-09-09** : l'Awalé d'abord, puis le Ludo.
Règles **classiques ouest-africaines** (et non les règles de tournoi Abapa).

Ce document fixe les règles avant l'implémentation. La leçon du jeu de dames
est qu'une règle laissée implicite se paie plus tard : trois positions de
test écrites à la main s'y sont révélées fausses, et une affirmation de règle
que personne n'avait vérifiée était fausse aussi. Ici, tout ce qui décide
d'un coup est écrit, et la vérification ne repose pas sur ma relecture.

## Ce que le lot réutilise sans rien construire

Tout le socle serveur existe et est **générique par conception** :

- le modèle `BoardGame` porte `kind`, `state Json`, `moveCount` — un
  deuxième jeu n'exige **aucune migration** ;
- les quatre routes `/api/salon` sont indifférentes au jeu ; la garde de
  monotonie sur `moveCount` et l'index unique partiel « une partie en cours
  par couple et par jeu » valent tels quels ;
- `lib/salon/jeux.ts` centralise la liste des jeux, l'état initial et la
  validation de forme. Ajouter l'Awalé s'y fait en un endroit, et le `switch`
  exhaustif fait échouer le typecheck si on l'oublie.

C'est précisément ce que ce lot doit démontrer : le second jeu prouve que la
généricité en valait la peine.

## Le plateau

Douze trous, deux rangées de six, **quarante-huit graines** — quatre par
trou au départ. Chaque joueur a un grenier, vide au départ.

Les trous sont numérotés **0 à 11 dans le sens du semis**. Le joueur `sud`
possède 0 à 5, le joueur `nord` possède 6 à 11. Le semis va toujours de 0
vers 11 puis revient à 0 : c'est un anneau.

`sud` ouvre la partie.

## Le coup

Un joueur prend **toutes** les graines d'un de **ses** trous non vides et
les sème une par une dans les trous suivants, dans le sens de l'anneau.

**Le trou de départ est sauté** quand le semis fait un tour complet — ce qui
arrive dès douze graines. C'est la première règle que les implémentations
naïves oublient : sans elle, un trou de douze graines se retrouverait avec
une graine au lieu de zéro.

## La prise

Si la **dernière** graine tombe dans un trou **adverse** et le porte à
**exactement deux ou trois** graines, ces graines sont prises.

La prise **remonte** ensuite : on examine le trou précédent, et tant qu'il
est adverse et contient exactement deux ou trois graines, il est pris aussi.
On s'arrête au premier trou qui échoue à la condition, ou en quittant la
rangée adverse.

Une prise qui emporte **toutes** les graines de l'adversaire est autorisée
et compte pleinement — c'est ce qui distingue les règles classiques retenues
des règles de tournoi Abapa, où un tel coup se joue sans rien prendre.

## Nourrir l'adversaire

Si l'adversaire n'a **aucune** graine au moment de jouer, le joueur **doit**
choisir un coup qui lui en donne au moins une.

Si aucun coup ne le permet, la partie s'arrête : le joueur **récolte toutes
les graines restant de son côté**.

C'est la règle qui empêche d'affamer l'adversaire pour gagner par forfait, et
la seule qui restreigne le choix des coups. Elle appartient donc au
générateur de coups légaux, pas à l'application du coup.

## La fin de la partie

- **Vingt-cinq graines** ou plus dans un grenier : ce joueur l'emporte —
  la majorité absolue des quarante-huit est acquise, la suite ne peut rien
  y changer.
- **Vingt-quatre partout** : partie nulle.
- **Famine sans issue** (voir ci-dessus) : les graines restantes vont à
  celui de leur côté, puis on compare les greniers.
- **Partie qui s'éternise** : réglée par le « match nul d'un commun accord »,
  déjà offert par l'écran du jeu de dames. Aucune règle de répétition n'est
  implémentée, et ce document le dit plutôt que de le laisser croire.

## L'architecture, identique au jeu de dames

Le moteur tourne **dans le navigateur**, en TypeScript pur. Le raisonnement
est le même et il est déjà écrit : aucune information cachée, aucun score
réel, deux joueurs sur un seul appareil — une validation serveur des coups
ne protégerait rien tout en coûtant un aller-retour par coup. Le serveur
valide la **forme** de l'état stocké, jamais sa légalité.

## La vérification — ce qui remplace le perft

Le jeu de dames avait des valeurs de perft publiées ; l'Awalé n'a pas
d'étalon équivalent. Trois invariants les remplacent, et ils sont plus forts
qu'une collection de positions choisies :

1. **Conservation** : la somme des douze trous et des deux greniers vaut
   **toujours 48**, après chaque coup, sans exception. Vérifiée sur des
   milliers de parties jouées au hasard. Une graine perdue ou dupliquée par
   le semis, la prise en cascade ou la récolte finale est attrapée
   immédiatement.
2. **Légalité** : aucun coup ne part d'un trou vide ni d'un trou adverse ;
   aucun trou ne devient négatif.
3. **Nourrissage** : quand l'adversaire est à zéro et qu'un coup nourrissant
   existe, tout coup légal en donne au moins une — et quand aucun n'existe,
   la partie se termine par la récolte.

Ces trois propriétés, éprouvées sur des parties aléatoires complètes, sont à
ce moteur ce que le perft était au précédent : elles jugent l'ensemble, pas
une règle isolée.

## Hors périmètre

Pas de règle de répétition, pas d'adversaire automatique, pas de score du
couple — l'étanchéité au Score de Fidélité vaut ici comme pour les dames.
Le Ludo suit dans un lot séparé.
