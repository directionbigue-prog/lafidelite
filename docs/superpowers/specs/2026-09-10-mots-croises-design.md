# Les mots croisés — cinquième jeu du Salon

Dernier jeu annoncé par le canevas du Salon. Sa particularité : **son contenu
est écrit, pas calculé**, et ce document dit pourquoi.

## Pourquoi le dictionnaire ne suffisait pas

La recherche sur les dictionnaires français (voir la spec du jeu « Le Mot »)
a établi que les listes de mots sont en licence MIT, donc libres d'emploi,
mais que les **définitions** ne viennent que du Wiktionnaire, en CC-BY-SA —
copyleft, attribution obligatoire, et une question de partage à l'identique
pour un produit commercial.

Et même en l'acceptant : une définition de dictionnaire fait une mauvaise
définition de mots croisés. Elle est trop technique, et elle contient souvent
le mot lui-même.

Les définitions de `frontend/src/lib/mots-croises/grilles.ts` sont donc
écrites pour ce produit.

## Comment les grilles ont été trouvées

Pas à la main — par recherche, en deux essais dont le premier a échoué, et
c'est instructif.

Le premier cherchait des **carrés de mots 5×5**, où les cinq lignes et les
cinq colonnes forment toutes des mots. Ça fonctionne mécaniquement : six
carrés trouvés en une seconde. Mais la contrainte est si dure qu'elle ne
laisse passer que du vocabulaire inutilisable — *abats*, *babil*, *bagou*,
*agami*, et jusqu'à *slang* et *tomat* qui ne sont même pas français.

Le second a ajouté **quatre cases noires**, ce qui relâche énormément la
contrainte, et surtout a puisé dans une **liste de mots courants écrite à la
main** plutôt que dans le dictionnaire entier. C'est le point qui compte : un
dictionnaire ne sait pas distinguer « fleur » de « agami ». Vingt-cinq
grilles de vrai français courant en sont sorties ; huit ont été retenues.

## La forme d'une grille

Cinq lignes sur cinq colonnes, quatre cases noires en (1,1), (1,3), (3,1) et
(3,3). Trois mots horizontaux — lignes 0, 2, 4 — et trois verticaux —
colonnes 0, 2, 4. Tous de cinq lettres.

```
A I M E R
V # A # E
R I R E S
I # I # T
L E N T E
```

Une grille est **entièrement décrite par ses six mots**. La matrice de lettres
n'est pas stockée : elle se déduit, ce qui rend impossible qu'elle contredise
les mots. Ce qui reste vérifiable — et **doit être vérifié par un test** —
c'est que les **neuf croisements concordent**. Une faute de frappe dans l'un
des six mots casse un croisement, et le test doit la voir. Les huit grilles
livrées ont été vérifiées ainsi : neuf croisements justes chacune, et chaque
mot présent au dictionnaire.

## Le jeu

Deux personnes, un appareil. **Chacun son tour, on tente un mot.**

1. Le joueur au trait choisit une définition encore sans réponse et propose
   un mot.
2. Juste : le mot s'inscrit dans la grille et lui est compté. Faux : rien ne
   s'inscrit.
3. **Dans les deux cas, la main passe.** L'alternance est stricte : c'est ce
   qui garantit à chacun le même nombre de tentatives et empêche l'un des
   deux de vider la grille pendant que l'autre regarde.
4. Un joueur qui ne voit pas peut **passer son tour**. Si les deux passent
   coup sur coup, la partie s'arrête là.

**Celui qui a trouvé le plus de mots l'emporte** ; à égalité, la partie est
nulle. Six mots par grille, donc les scores possibles vont de 6–0 à 3–3.

Les lettres déjà posées par les mots trouvés **aident pour les suivants** :
c'est tout l'intérêt des croisements, et la raison pour laquelle la grille
doit rester visible en permanence.

## Ce qui est visible, et ce qui ne l'est pas

Comme pour « Le Mot », les réponses sont dans le navigateur : qui ouvre les
outils de développement peut les lire. C'est acceptable ici pour la même
raison — le pass-and-play suppose déjà cette confiance, l'adversaire est la
personne assise à côté, et la partie ne compte dans aucun score.

La différence avec « Le Mot » joue en faveur de ce jeu-ci : **les deux
joueurs cherchent les mêmes réponses**, donc la situation est symétrique. Il
n'y a pas un joueur qui sait et un qui devine.

## L'architecture

Identique aux quatre autres : moteur en TypeScript pur dans le navigateur,
`BoardGame` générique donc **aucune migration**, validation de **forme**
seulement côté serveur — ici : un identifiant de grille connu, des mots
trouvés qui appartiennent à cette grille, un trait valide.

Étanchéité totale au Score de Fidélité.

## Hors périmètre

Pas de grilles plus grandes, pas de mots de longueur variable, pas de
chronomètre. Pas de génération automatique de grilles : les huit livrées
suffisent à un couple qui joue de temps en temps, et en ajouter revient à
écrire six définitions de plus — un travail d'écriture, pas de code.
