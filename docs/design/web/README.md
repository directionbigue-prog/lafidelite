# Canvas « version web » + « écrans du jeu » — ce qui est implémentable, ce qui ne l'est pas

## Source

Deux canvas Claude Design, fournis comme **artefacts publiés** :

- **Web** — `Coeur Fidele Web.dc.html`, 6 planches en 1440 × 900.
  Source décompressée : [Coeur-Fidele-Web.source.html](Coeur-Fidele-Web.source.html) ·
  rendus : [planches/](planches/)
- **Mobile** — 12 écrans en 390 × 844.
  Source : [../mobile/Coeur-Fidele-Mobile.source.html](../mobile/Coeur-Fidele-Mobile.source.html) ·
  rendus : [../mobile/planches/](../mobile/planches/)

Le lien `claude.ai/design/p/…` fourni au départ n'était **pas** lisible depuis
cette session : Cloudflare se franchit, mais claude.ai redirige vers `/login`
et le partage exige une session connectée. Les artefacts publiés, eux, se
lisent directement. C'est le chemin à réutiliser.

Palette du canvas : `#170D1B` `#F6EEE6` `#E8B860` `#8B2C56` `#3A1B33`
`#241129` `#1E1023` — **ce sont déjà les tokens du projet**. Aucun nouveau
token nécessaire. Police : Familjen Grotesk, déjà en place.

## Le constat principal

Le design décrit un produit **sensiblement plus large que ce qui est
construit**, et sur un point il décrit un produit *différent*.

### Ce qui n'est pas une question de design mais d'architecture

| Le canvas montre | L'état du code |
|---|---|
| **Deux appareils** : invitation WhatsApp, « Malick est en ligne », « en train de choisir / a déjà répondu », écran de reconnexion avec compte à rebours | Le moteur est **pass-and-play**, un seul appareil, par décision explicite du plan. Le temps réel y était hors périmètre. |
| **Économie de points** : solde commun, packs, abonnement Duo, débit à la fin de partie, remboursement si la partie s'arrête | Aucune. Les paiements sont une phase ultérieure. |
| **Catégories** avec verrouillage (gratuit / Abonnement Duo / 18+ accord des deux) | Les questions ont un champ `category`, mais rien ne les expose ni ne les vend. |
| **Trois formats** : 5 / 15 / 30 questions | Le moteur est figé à 3 manches × 5 questions. |
| Carte partageable, export image | Néant. |
| « Nos parties », « Rapport de Couple » | Néant. |

**Le pass-and-play n'est pas abandonné** : l'écran 12 du canvas mobile est
« Passe le téléphone à Malick », et l'écran 02 propose explicitement
« Envoyer sur WhatsApp » *ou* « Jouer sur un seul téléphone ». Le mode
construit est donc la **branche secondaire** du produit visé, pas une
impasse. C'est une bonne nouvelle : rien n'est à jeter.

Si le mode deux appareils est confirmé, CLAUDE.md tranche déjà la question
technique : **Ably**, pas de WebSocket ni de SSE depuis une fonction Vercel.

### Un écart de données, à trancher

La planche 01 affiche « 248 · Complices · **52 points avant le niveau
Inséparables** ». Avec les seuils livrés (`COMPLICITY_THRESHOLDS` :
0 / 100 / 300 / 600), 248 + 52 = 300 ouvre **Fusionnels**, pas Inséparables.
L'écran implémenté suit **les données**, pas la maquette, et un test
l'épingle. À corriger d'un côté ou de l'autre.

## Ce qui est livré

La coquille applicative de la planche 01 —
[AppShell](../../../src/components/app/AppShell.tsx) — et le tableau
de bord `/jeu` recomposé dessus, plus `/settings` placé dans la même
coquille.

Trois écarts assumés, tous du même principe : **ne rien afficher que rien ne
calcule**.

1. La barre latérale du canvas liste cinq destinations. Trois n'ont pas de
   page. Elles sont **omises**, pas rendues inertes — le repo a un garde-fou
   contre les liens internes morts, et une navigation qui ment sur ce qui
   existe est pire qu'une navigation courte.
2. La carte « Solde commun · 200 pts » est **absente** : il n'y a pas
   d'économie de points, et afficher un chiffre que rien ne produit est une
   fausse promesse.
3. Les deux cartes de statistiques (« 7 parties jouées », « 4 catégories
   ouvertes sur 8 ») sont **absentes**. Le décompte de parties est facile à
   ajouter ; les catégories n'existent pas.

Écart mineur : la pastille de marque est **wine** ici et gold sur le canvas.
Un seul verrou de marque par produit vaut mieux que la fidélité à une seule
planche.

## Ordre de construction suggéré

Du moins risqué au plus structurant :

1. **Compte de parties jouées** — une carte de stat réelle, un `COUNT` sur
   `GameSession`. Petit.
2. **Catégories** — le champ existe déjà sur `Question` ; il manque la
   sélection et l'écran. Sans verrouillage payant dans un premier temps.
3. **Formats 5 / 15 / 30** — touche la création de session et le moteur de
   manches. Moyen.
4. **Économie de points + paiement** — Bictorys est déjà câblé pour Wave /
   Orange Money / carte, et le pattern outbox existe. C'est le plus gros
   morceau, et il change les écrans de résultats et de recharge.
5. **Deux appareils (Ably)** — le plus structurant. Change la state machine,
   la présence, la reprise. À faire en dernier, et seulement une fois le
   mode confirmé.

## Étape 2 — la sélection de thèmes, et ce qu'elle a coûté

**Livrée.** Les huit thèmes des maquettes sont jouables, et l'écran de
sélection existe sur `/jeu/nouvelle`.

### Ce qui bloquait

Le moteur acceptait `categories` depuis le lot 2 — `selectQuestionsForRound`,
`narrowToCategories`, `GET /api/questions/categories`, `POST /api/games`.
Rien de tout cela ne manquait. Ce qui manquait, c'était le contenu.

Les catégories de la banque étaient **scopées par type de manche** :

| Manche | Catégories (avant) |
|---|---|
| MIROIR | Communication (3), Quotidien & habitudes (4), Souvenirs & couple (2) |
| SCENARIO | Confiance & Jalousie (5), Réseaux sociaux & Téléphone (4) |
| FACEAFACE | Quotidien (4), Valeurs & couple (5) |

Les maquettes présentent des thèmes qui **traversent toute la partie**.
**Deux des huit existaient. Les six autres avaient zéro question.**

Le défaut était silencieux, et c'est ce qui le rendait grave. Un thème trop
maigre ne provoque ni erreur ni manche courte : une manche fait exactement
5 questions (10 en Longue soirée), et `narrowToCategories` **élargit** au
pool complet quand la restriction ne tient pas. La partie se jouait
normalement — sur un autre sujet que celui qu'on avait choisi. Choisir
« Confiance & Jalousie » ne changeait que la manche 2.

### Ce qui a été fait — option 1

Re-remplissage de la banque avec des thèmes transversaux, un fichier par
thème sous `prisma/seed-data/themes/`. Le seuil retenu n'est pas
« au moins une question » mais **dix par manche** : le tirage maximal
(Longue soirée, 10/10/10). En dessous, un thème marcherait en Express et
retomberait en silence sur le pool complet en Longue soirée — le même
mensonge, une fois sur trois.

| | avant | après |
|---|---|---|
| Thèmes jouables | 0 | 8 |
| Questions | 27 | 267 |
| Couverture par thème | — | 10 MIROIR / 10 SCENARIO / 10 FACEAFACE |

Les 27 questions d'origine sont conservées comme **fonds général** : leurs
catégories ne figurent pas dans les huit, donc elles ne sont jamais
proposées à la sélection, mais elles restent tirables par une partie sans
thème choisi. Les forcer dans un des huit aurait produit des cartes qui
mentent sur leur contenu — exactement le défaut qu'on supprimait.

### Le garde-fou

`src/lib/game/themes.ts` est le registre unique des huit thèmes, et
`themes.test.ts` fait échouer CI dès qu'un thème repasse sous le seuil. Le
test ne se contente pas de compter : il rejoue `narrowToCategories` sur la
banque réelle, thème par thème et manche par manche, et exige
`narrowed === true`. C'est la seule assertion qui distingue « le thème a du
contenu » de « le thème est effectivement honoré par le tirage ».

## Étape 3 — les paliers d'accès

Les thèmes une fois réels, il fallait décider qui y a droit. Quatre
paliers, définis une seule fois dans
`src/lib/game/packs.ts` :

| Palier | Prix | Thèmes | Salon | Parties |
|---|---|---|---|---|
| Découverte | gratuit | 1 — Confiance & Jalousie | non | une offerte |
| Essentiel | 4 900 FCFA / mois | 6 | inclus | illimitées |
| Intégral | 9 900 FCFA / mois | 8 | inclus | illimitées |
| Annuel | 118 800 FCFA / an | 8 | inclus | illimitées |

L'annuel vaut exactement douze mois d'Intégral, sans remise : c'est la
règle telle qu'elle a été donnée, et elle se change à un seul endroit.

### Trois décisions qui ne se devinent pas

**Le droit appartient à un compte, l'accès appartient au couple.** Il
suffit qu'un des deux partenaires détienne un pack. C'est l'inverse de la
partie offerte, qui se compte par compte — et l'écart est voulu : une
partie offerte est une *consommation* qu'un compte dépense, un pack achète
du *contenu* que le couple consomme ensemble, sur un seul appareil. Faire
payer deux fois le même thème au même couple parce que c'est le téléphone
de l'autre qui est allumé n'aurait aucun sens.

**Un pack payant dispense de la règle de la partie offerte.** Sans cette
ligne, un abonné paie 9 900 FCFA et se voit refuser sa deuxième partie.
C'est le défaut le plus coûteux que cette route puisse avoir, et il a son
propre test.

**Un thème fermé est refusé, jamais retiré en silence.** `403
THEME_LOCKED`, avec la liste des thèmes en cause. Le retrait silencieux
aurait reproduit exactement le défaut que l'étape 2 venait de supprimer.
La porte du Salon (`SALON_LOCKED`) est posée sur la **création** seule :
lecture, sauvegarde et fin de partie restent ouvertes, pour qu'un pack qui
expire au milieu d'une partie de ludo ne laisse pas un plateau inachevé et
irrécupérable.

### Ce qui reste ouvert

**Les moyens de paiement ne sont pas intégrés**, à la demande. Le tunnel
existe pourtant déjà côté starter — `POST /api/orders` appelle Bictorys et
le webhook passe la commande à PAID dans une transaction `Serializable`.
C'est là, dans cette transaction, que l'`Entitlement` devra être créé : au
même endroit que le changement de statut, avec le même `expiresAt`.
`/tarifs` affiche donc les prix sans bouton d'achat — un bouton qui ne
prélève rien est un mensonge d'interface.

En attendant, `pnpm abonner <email> [ESSENTIEL|INTEGRAL|ANNUEL]` accorde un
droit à la main, et refuse de tourner en production.

Les compteurs de la page d'accueil (60 / 50 par thème, 440 au total)
restent des chiffres de maquette : la banque en livre 267. Voir l'en-tête
de `src/app/page.tsx`, qui liste les écarts assumés.

## Étape 4 — les écrans de jeu, d'après le canvas mobile

Le canvas mobile décrit douze écrans ; cinq d'entre eux existaient déjà en
code, avec un habillage antérieur au canvas. Cette passe les y amène.

### Un défaut trouvé en chemin

La barre de progression comptait **cinq questions par manche, en dur**.
C'était vrai de toutes les parties jusqu'à la livraison des trois formats
(Express 5, Standard 15, Longue soirée 30). Depuis, deux écrans sur trois
étaient faux, silencieusement :

- une manche Express contient 2 questions, et l'écran annonçait
  « Question 1 sur 5 » ;
- une manche Longue soirée en contient 10, et à partir de la question 6 la
  barre **disparaissait entièrement** — la vérification de bornes rejetait
  la position comme impossible.

Aucun test ne tombait : le calcul était juste, l'hypothèse ne l'était plus.
`GET /api/games/current` renvoie désormais `questionsPerRound`, compté sur
les lignes réellement tirées, et [`gameProgress`](../../../src/lib/game/progress.ts)
le prend en paramètre. Les longueurs sont **additionnées**, jamais
multipliées : Express fait 2/2/1.

### Ce qui est livré

| Canvas | Écran | Ce qui change |
|---|---|---|
| 05 / 06 | `/jeu/[id]/question` | La question posée à même le fond, en serif 31px, sans carte. Options en pavés arrondis avec la coche de sélection. « Valider » et « Passer · 2 » côte à côte au lieu d'un lien souligné. La ligne « Personne ne verra votre réponse avant la fin de la manche. » |
| 08 | `/jeu/[id]/manche-revelee` | Le titre est devenu un **décompte** — « Vous vous êtes compris 3 fois sur 5 » — et chaque question porte une pastille *Ensemble* / *Divergence*. |
| 09 | `/jeu/[id]/resultats` | Le score en gold sur un dégradé, le niveau en pastille. |
| 12 | `/jeu/[id]/passe` | Fond **wine pleine page**, initiale dans une tuile, bouton pleine largeur, position en pied de page. |
| — | la barre | Un segment par question de la manche, comme le canvas, et non plus un par manche. |

### Le fond crème de la manche Scénarios

Le canvas donne à l'écran 06 un fond **crème** là où l'écran 05 est sur
ink. Ce n'est pas une variante de présentation : les deux écrans sont par
ailleurs identiques, donc la seule lecture cohérente est que **le fond suit
la manche**. C'est implémenté ainsi
([`round-ground.ts`](../../../src/lib/game/round-ground.ts)), et
tout ce que les deux fonds ne partagent pas est énuméré à un seul endroit —
une classe sombre oubliée sur fond clair ne donne pas une nuance
approximative, elle donne du texte invisible.

**La réserve, à trancher par le produit :** une partie se joue le soir. Le
passage ink → crème → ink au milieu du jeu est un éclair en pleine figure
dans une pièce sombre. Le canvas l'assume ; si à l'usage c'est
désagréable, la manche 2 revient sur ink en changeant une ligne
(`groundForRound`).

### Trois écarts assumés

1. Le bouton de l'écran 12 est **gold**, pas crème. La plateforme a une
   seule couleur d'action, et une seconde introduite pour un écran est
   exactement la dérive que le primitif `Button` a été écrit pour arrêter.
2. Les questions de la révélation **restent dans l'ordre joué**, pastillées,
   là où le canvas ne montre que les divergences. Rien n'est caché et rien
   n'est renuméroté.
3. « Points de la manche +82 » est **absent** : le score n'est calculé qu'à
   la fin de la partie, et cet écran n'a pas le droit d'afficher de points
   (contrainte produit, pas limite technique).

### Un second écart de données — le « score de couple »

Repéré en capturant l'écran 09 sur une vraie partie : le grand chiffre
affiché était **20**, au-dessus de deux scores individuels de **59**
chacun. Rien n'est cassé, mais à l'écran cela se lit comme un bug.

Les deux quantités ne mesurent pas la même chose :

- `coupleScore = alignmentPointsShared × 2` — les seuls accords de la
  manche Face à face. Sur une partie Express, une seule question de ce
  type : 10 × 2 = 20.
- le score individuel additionne Miroir + Fidélité × 1,5 + Alignement +
  bonus de rapidité.

Le canvas, lui, affiche **312 · 164 · 148** — et 164 + 148 = 312. Dans la
maquette, le score de couple **est la somme des deux**.

**Décision : la logique d'origine reste, c'est l'écran qui s'adapte.**
`coupleScore = alignmentPointsShared × 2` ne bouge pas, et les seuils de
`COMPLICITY_THRESHOLDS`, calibrés sur environ 100 points par partie, non
plus.

Ce que l'écran dit maintenant, et pourquoi c'est vrai :

- Le grand chiffre est écrit **avec son signe** — `+20`, pas `20`. Ce
  n'est pas un total, c'est un **gain** : `POST /round/advance`
  incrémente `Couple.cumulativeCoupleScore` d'exactement cette valeur, et
  le niveau de complicité se déduit de ce cumul. Le signe suffit à ce
  qu'un chiffre plus petit que ceux d'en dessous cesse de se lire comme
  une erreur.
- Le libellé nomme la manche d'où il vient — « votre accord ce soir »,
  « vos réponses communes en Face à face » — au lieu de prétendre
  résumer la partie.
- Les scores individuels sont explicitement **le décompte du soir** :
  « ces points comptent pour la partie, pas pour votre niveau. » C'est
  littéralement vrai — ils sont stockés sur `GameResult` et ne sont
  jamais additionnés à quoi que ce soit.

Cohérence vérifiée avec le tableau de bord, qui affiche « Score du
couple » pour `cumulativeCoupleScore` : les deux écrans parlent bien de
la même grandeur, l'un en cumul, l'autre en gain de la soirée.
