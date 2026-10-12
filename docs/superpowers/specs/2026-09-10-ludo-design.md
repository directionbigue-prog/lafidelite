# Le Ludo — troisième jeu du Salon

Suite décidée avec l'utilisateur le 2026-09-09 : l'Awalé d'abord, puis le
Ludo. Les deux premiers jeux du Salon sont livrés ; celui-ci est le premier
à comporter du **hasard**, ce qui pose deux questions que les précédents
n'avaient pas.

Comme pour l'Awalé, tout ce qui décide d'un coup est écrit ici avant
l'implémentation. Les variantes du Ludo sont nombreuses et changent
réellement la partie ; celles retenues sont nommées, et celles écartées
aussi.

## Les deux questions du hasard

### Qui lance les dés

**Le navigateur**, comme le reste du moteur. C'est la même décision que pour
les dames et l'Awalé, et elle tient pour la même raison : deux personnes
partagent un seul écran, il n'y a aucune information cachée et aucun score
réel. Un dé lancé côté serveur ne protégerait personne — le seul adversaire
possible est la personne assise à côté, qui voit le même écran — et coûterait
un aller-retour par lancer, sur un plancher mesuré à ~320 ms.

Ce raisonnement cesserait de tenir le jour du mode deux appareils : là, le
dé devient une information qu'un joueur pourrait fabriquer sans que l'autre
le voie. C'est écrit ici pour que ce lot-là sache qu'il devra revenir sur ce
point, plutôt que de découvrir le problème en production.

### Le dé fait partie de l'état

Un lancer déjà effectué mais pas encore joué **est persisté avec le
plateau**. Sans cela, recharger la page entre le lancer et le déplacement
redonnerait un dé — c'est-à-dire un moyen trivial de relancer jusqu'à obtenir
un six. L'état porte donc le dé courant, et le générateur de coups en dépend.

C'est la seule différence structurelle avec les deux moteurs précédents, où
l'état se réduisait aux pièces et au trait.

## Le plateau

Deux joueurs, quatre pions chacun. Un circuit commun de **52 cases**, puis
une **colonne d'arrivée de 5 cases** propre à chaque joueur, et un **enclos**
de départ où les pions attendent.

Chaque joueur a sa case d'entrée sur le circuit, les deux étant diamétralement
opposées. Un pion parcourt les 52 cases à partir de son entrée, puis bifurque
dans sa propre colonne d'arrivée — il ne repasse jamais par l'entrée de
l'adversaire une seconde fois.

## Le tour

On lance un dé à six faces.

- **Il faut un six pour sortir** un pion de l'enclos ; il se pose alors sur la
  case d'entrée du joueur.
- **Un six rejoue.** Trois six d'affilée annulent le tour — sans cette borne,
  une partie peut ne jamais rendre la main.
- Sinon, le joueur avance l'un de ses pions du nombre de points du dé.
- **Si aucun coup n'est possible**, le tour passe à l'adversaire. Cela arrive
  souvent : tous les pions dans l'enclos sans six, ou aucun pion assez proche
  de l'arrivée pour le score exact.

## La prise

Un pion qui termine son déplacement sur une case occupée par **un pion
adverse** le renvoie dans son enclos.

**Les cases d'entrée des deux joueurs sont sûres** : un pion qui s'y trouve ne
peut pas être pris. C'est ce qui empêche de camper sur l'entrée adverse.

Une prise **ne donne pas de tour supplémentaire**. C'est un choix : la
variante qui l'accorde rend les parties très inégales, ce qui convient mal à
deux personnes qui jouent ensemble pour se détendre.

## L'arrivée

Après avoir bouclé le circuit, un pion entre dans sa colonne d'arrivée. Il
faut le **score exact** pour atteindre la case finale : un dé trop grand rend
le coup impossible pour ce pion, et il faut en jouer un autre.

**Le premier joueur qui amène ses quatre pions à l'arrivée gagne.**

## Ce qui est écarté, et pourquoi

- **Les blocages** (deux pions d'un même camp sur une case interdisant le
  passage) : ils allongent beaucoup les parties et transforment le jeu en
  guerre de position. Écartés.
- **Les cases étoilées supplémentaires** : seules les deux entrées sont
  sûres. Moins de règles à expliquer avant de jouer.
- **Le tour supplémentaire à la prise** : voir ci-dessus.

Ces trois choix vont dans le même sens — une partie plus courte et moins
punitive, ce que la carte du Salon annonce déjà à dix minutes.

## La vérification — ce qui remplace le perft

Comme pour l'Awalé, il n'existe pas d'étalon publié. Le hasard n'empêche pas
de vérifier : il suffit de fixer la graine du générateur pour que toute partie
soit reproductible. Quatre invariants, éprouvés sur des milliers de parties
jouées au hasard :

1. **Conservation** : chaque joueur possède **toujours exactement quatre
   pions**, chacun dans un lieu valide — enclos, circuit, colonne d'arrivée
   ou arrivée. Aucun pion ne disparaît, aucun ne se dédouble.
2. **Légalité** : aucun coup ne déplace un pion adverse, ne sort de l'enclos
   sans six, ne dépasse la case d'arrivée, ni ne prend un pion sur une case
   sûre.
3. **Terminaison** : toute partie se termine en un nombre borné de tours.
   C'est l'invariant propre à ce jeu — il attrape la règle des trois six
   manquante et les situations où plus personne ne peut jouer.
4. **Progression** : un tour qui ne peut rien jouer passe la main, et ne
   laisse jamais l'état inchangé avec le même joueur au trait — sans quoi
   l'écran se figerait sans rien dire.

## L'architecture

Identique aux deux jeux précédents. Moteur en TypeScript pur dans le
navigateur, `BoardGame` générique donc **aucune migration**, validation de
**forme** seulement côté serveur — ici : quatre pions par camp, des positions
dans les bornes, un dé absent ou compris entre un et six, un trait valide.

Étanchéité totale au Score de Fidélité, comme les deux autres.

## Hors périmètre

Pas d'adversaire automatique, pas de mode deux appareils, pas d'animation de
dé. La nulle par accord, déjà offerte par les autres écrans, sert ici aussi
de sortie pour une partie qui s'éternise.
