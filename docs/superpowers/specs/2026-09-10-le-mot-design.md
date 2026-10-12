# Le Mot — quatrième jeu du Salon

Décidé avec l'utilisateur le 2026-09-10, après une recherche sur les
dictionnaires français disponibles. Ce document dit ce que cette recherche a
établi, parce que le résultat change la conception.

## Ce que la recherche a établi

**Les listes de mots existent et le point juridique est propre.**
`an-array-of-french-words` est en **licence MIT** — 336 524 mots français
accentués. Vérifié en la téléchargeant et en la comptant, pas seulement en la
citant. Utilisable commercialement sans contrainte, à charge de conserver la
mention de licence.

**Les définitions, elles, ne sont pas libres de la même façon.** Les seules
données françaises qui en portent viennent du Wiktionnaire (via kaikki.org),
en **CC-BY-SA** : copyleft, attribution obligatoire, et une question de
partage à l'identique qui se pose pour un produit commercial. C'est la raison
pour laquelle les **mots croisés** ne se font pas à partir d'un dictionnaire :
une grille a besoin de définitions, pas de mots. Leurs grilles seront donc
écrites à la main, dans un lot suivant.

**Deux besoins distincts, deux listes.** Les chiffres, mesurés :

| Longueur | Mots | Poids JSON |
|---|---|---|
| 5 lettres | 6 806 | 56 Ko |
| 6 lettres | 15 726 | 145 Ko |
| 7 lettres | 27 899 | 285 Ko |

Mais la liste est pleine de formes conjuguées — *gagez*, *filât*, *gagea*,
*gaina*. Elles sont **parfaitement acceptables comme tentatives** : refuser
« gaffa » à un joueur qui l'a écrit à juste titre serait vexant. Elles sont
**inacceptables comme mot à deviner** : chercher *filât* pendant six essais
rendrait le jeu odieux.

C'est ce constat qui fixe la conception ci-dessous.

## Le jeu

Deux personnes, un seul appareil. **L'un choisit un mot, l'autre le devine.**

C'est le choix qui résout le problème des mots obscurs : plutôt que de tirer
un mot au hasard dans une liste truffée de formes conjuguées, **c'est un être
humain qui choisit** — et un humain choisit un mot que son partenaire peut
trouver. Le dictionnaire ne sert alors qu'à ce qu'il fait bien : vérifier
qu'un mot existe.

Une manche :

1. Le joueur qui propose saisit un mot de **cinq lettres**, vérifié contre le
   dictionnaire. Puis il passe l'appareil.
2. L'autre a **six tentatives**. Chaque tentative doit être un mot du
   dictionnaire — une suite de lettres au hasard est refusée sans consommer
   d'essai.
3. Après chaque tentative, chaque lettre est marquée : **bien placée**,
   **présente ailleurs**, ou **absente**.
4. La manche s'arrête sur le mot trouvé, ou après la sixième tentative.

Puis les rôles s'échangent pour une seconde manche. **Celui qui a trouvé en
moins de tentatives l'emporte** ; à égalité de tentatives, ou si aucun des
deux ne trouve, la partie est nulle.

## La règle qui piège toutes les implémentations

Le marquage des lettres se trompe presque toujours sur les **lettres
répétées**, et c'est le seul endroit de ce moteur qui mérite de la méfiance.

Si le mot est `ARBRE` et la tentative `RIRES`, il y a deux `R` dans le mot et
deux dans la tentative — mais l'un des `R` de la tentative est bien placé et
l'autre non. Si le mot est `ARBRE` et la tentative `RRRRR`, seuls **deux** `R`
doivent être marqués, pas cinq.

L'algorithme correct se fait **en deux passes** :

1. D'abord marquer toutes les lettres **bien placées**, et retirer chacune du
   compte des lettres encore disponibles dans le mot.
2. Ensuite seulement, parcourir les lettres restantes : une lettre est
   marquée « présente ailleurs » **si et seulement s'il reste au moins une
   occurrence non consommée** de cette lettre.

Une implémentation en une seule passe marque trop de lettres et donne des
indices faux. C'est la règle à vérifier par mutation.

## Ce qui est visible, et ce qui ne l'est pas

**C'est le premier jeu du Salon qui comporte une information cachée**, et
cela mérite d'être dit franchement plutôt que découvert plus tard.

Le mot à deviner est dans l'état de la partie, donc dans le navigateur du
joueur qui devine. Quelqu'un qui ouvre les outils de développement peut le
lire.

Cela reste acceptable ici, pour la même raison que tout le reste du produit :
**le pass-and-play suppose déjà cette confiance.** Dans le jeu du couple, les
réponses de l'un sont sur l'appareil que l'autre tient. L'adversaire est la
personne assise à côté, la partie ne compte dans aucun score, et tricher
demande d'ouvrir délibérément une console pour gagner un jeu de lettres
contre son partenaire.

Ce qui serait faux, en revanche, c'est de prétendre que le mot est protégé.
Il ne l'est pas, et le mode deux appareils devra le déplacer côté serveur —
c'est écrit ici pour que ce lot-là le sache.

## Le dictionnaire embarqué

La liste des mots de cinq lettres est **embarquée dans le dépôt** (56 Ko), pas
récupérée sur le réseau à l'exécution : un jeu qui dépend d'un dépôt tiers
au moment où on y joue tombe le jour où ce dépôt bouge.

La mention de licence MIT et l'origine de la liste accompagnent le fichier.
Le filtrage — mots de cinq lettres, lettres seules — est fait **une fois**,
par un script de préparation, pas à chaque chargement.

## L'architecture

Identique aux trois autres jeux : moteur en TypeScript pur dans le
navigateur, `BoardGame` générique donc **aucune migration**, validation de
**forme** seulement côté serveur — ici : un mot de cinq lettres, une liste de
tentatives d'au plus six entrées, un trait valide.

Étanchéité totale au Score de Fidélité.

## Hors périmètre

Pas de mots de six ou sept lettres — la longueur est fixe, et l'ajouter plus
tard ne coûte qu'une liste de plus. Pas de clavier virtuel montrant les
lettres déjà éliminées (utile, mais ce n'est pas le jeu). Pas de tirage
aléatoire du mot, pour la raison expliquée plus haut.
