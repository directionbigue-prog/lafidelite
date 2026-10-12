// L'état d'une partie de mots croisés, et rien d'autre.
//
// Comme pour les dames, l'Awalé, le Ludo et Le Mot : aucune dépendance à
// Prisma, React ou au DOM. Le même module tourne dans le navigateur pendant
// la partie, dans Vitest pour les invariants, et un jour côté serveur, sans
// une ligne à changer.
//
// Une grille est décrite par SIX mots (voir `grilles.ts`) : trois
// horizontaux (lignes 0, 2, 4) et trois verticaux (colonnes 0, 2, 4). Cet
// état ne stocke donc que ce qui ne se déduit pas de la grille elle-même :
// quelle grille est jouée, quels emplacements sont déjà trouvés et par qui,
// à qui le trait, et combien de passages viennent de s'enchaîner. Le MOT
// trouvé à chaque emplacement n'est pas stocké non plus — il se relit dans
// `grilles.ts` via `motAttendu`, pour la même raison que la matrice de
// lettres ne l'est pas (voir `matriceLettres` plus bas) : un champ qui
// duplique une donnée déjà écrite ailleurs est un champ qui peut un jour la
// contredire.
import { GRILLES, type Grille } from './grilles';

export type Joueur = 'un' | 'deux';

/** Les deux directions d'un mot dans la grille. */
export type Direction = 'horizontal' | 'vertical';

/** Chaque direction porte exactement trois mots — voir l'en-tête de `grilles.ts`. */
export type IndexMot = 0 | 1 | 2;

/** Six mots par grille : ce que vaut une partie entièrement résolue. */
export const MOTS_PAR_GRILLE = 6;

/** La taille, fixe, d'une grille — voir la spec, « Hors périmètre ». */
export const TAILLE_GRILLE = 5;

export function autreJoueur(joueur: Joueur): Joueur {
  return joueur === 'un' ? 'deux' : 'un';
}

/** Un emplacement de mot dans la grille : une direction et son rang. */
export interface Emplacement {
  readonly direction: Direction;
  readonly index: IndexMot;
}

/** Un mot trouvé : son emplacement, et qui l'a trouvé. */
export interface MotTrouve extends Emplacement {
  readonly trouvePar: Joueur;
}

export interface EtatMotsCroises {
  readonly idGrille: string;
  /** Au plus six — un par emplacement, jamais deux fois le même. */
  readonly trouves: readonly MotTrouve[];
  readonly trait: Joueur;
  /**
   * 0, 1 ou 2 passages d'affilée. Une tentative — juste ou fausse — le
   * remet à 0 ; deux passages consécutifs arrêtent la partie (voir
   * `partie.ts`, `partieTerminee`).
   */
  readonly passesConsecutifs: 0 | 1 | 2;
}

/** Les six emplacements d'une grille, dans un ordre stable : horizontaux puis verticaux. */
export function tousLesEmplacements(): readonly Emplacement[] {
  const indices: readonly IndexMot[] = [0, 1, 2];
  const directions: readonly Direction[] = ['horizontal', 'vertical'];
  return directions.flatMap((direction) => indices.map((index) => ({ direction, index })));
}

/**
 * La position de départ pour `idGrille` : aucun mot trouvé, « un » a le
 * trait, aucun passage.
 *
 * Ne tire AUCUNE grille au hasard — ce moteur n'appelle jamais
 * `Math.random()` (voir la spec) : c'est à l'appelant de tirer une grille
 * et de passer son identifiant ici, exactement comme `lib/salon/jeux.ts`
 * le fait pour une nouvelle partie. `idGrille` doit désigner une grille
 * connue, sans quoi la partie n'aurait aucun mot à jouer ; c'est le seul
 * cas où cette fonction lève.
 */
export function positionDepart(idGrille: string): EtatMotsCroises {
  trouverGrille(idGrille);
  return { idGrille, trouves: [], trait: 'un', passesConsecutifs: 0 };
}

/** La grille désignée par `idGrille` — lève si elle n'existe pas. */
export function trouverGrille(idGrille: string): Grille {
  const grille = GRILLES.find((g) => g.id === idGrille);
  if (grille === undefined) {
    throw new Error(`Grille de mots croisés inconnue : ${idGrille}`);
  }
  return grille;
}

function motDeGrille(
  grille: Grille,
  emplacement: Emplacement,
): { mot: string; definition: string } {
  const liste = emplacement.direction === 'horizontal' ? grille.horizontaux : grille.verticaux;
  return liste[emplacement.index];
}

/** Le mot attendu à `emplacement` — déjà en minuscules, sans accent (voir `grilles.ts`). */
export function motAttendu(grille: Grille, emplacement: Emplacement): string {
  return motDeGrille(grille, emplacement).mot;
}

/** La définition affichée pour `emplacement`. */
export function definitionA(grille: Grille, emplacement: Emplacement): string {
  return motDeGrille(grille, emplacement).definition;
}

/** Une cellule de la matrice déduite : sa lettre, ou `null` pour une case noire. */
export type Cellule = string | null;

function lettreDe(mot: string, position: number): string {
  const lettre = [...mot][position];
  if (lettre === undefined) {
    throw new Error(`Position hors mot : « ${mot} »[${position}]`);
  }
  return lettre;
}

/**
 * La matrice de lettres 5×5, déduite des six mots de `grille` — jamais
 * stockée (voir l'en-tête de `grilles.ts`). C'est la fonction qui protège
 * les grilles futures : elle lit les DEUX sources à chaque croisement (le
 * mot horizontal ET le mot vertical qui se superposent à cette case) et
 * LÈVE si elles ne concordent pas, plutôt que de faire silencieusement
 * confiance à l'une des deux. Une faute de frappe dans n'importe lequel des
 * six mots — ou un mot qui ne compte pas cinq lettres — se voit donc ici,
 * jamais en silence.
 */
export function matriceLettres(grille: Grille): readonly (readonly Cellule[])[] {
  const [h0, h1, h2] = grille.horizontaux;
  const [v0, v1, v2] = grille.verticaux;

  for (const { mot } of [h0, h1, h2, v0, v1, v2]) {
    if ([...mot].length !== TAILLE_GRILLE) {
      throw new Error(
        `Le mot « ${mot} » de la grille « ${grille.id} » ne compte pas ${TAILLE_GRILLE} lettres.`,
      );
    }
  }

  const motH = (i: IndexMot): string => (i === 0 ? h0.mot : i === 1 ? h1.mot : h2.mot);
  const motV = (j: IndexMot): string => (j === 0 ? v0.mot : j === 1 ? v1.mot : v2.mot);
  const indices: readonly IndexMot[] = [0, 1, 2];

  for (const i of indices) {
    for (const j of indices) {
      const lettreH = lettreDe(motH(i), 2 * j);
      const lettreV = lettreDe(motV(j), 2 * i);
      if (lettreH !== lettreV) {
        throw new Error(
          `Croisement incohérent dans la grille « ${grille.id} » : l'horizontal ${i} et le vertical ${j} ne s'accordent pas (« ${lettreH} » ≠ « ${lettreV} »).`,
        );
      }
    }
  }

  const ligneSparse = (ligne: number): readonly Cellule[] => [
    lettreDe(motV(0), ligne),
    null,
    lettreDe(motV(1), ligne),
    null,
    lettreDe(motV(2), ligne),
  ];

  return [[...motH(0)], ligneSparse(1), [...motH(1)], ligneSparse(3), [...motH(2)]];
}
