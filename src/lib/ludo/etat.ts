// L'état d'une partie de Ludo, et rien d'autre.
//
// Comme les dames et l'Awalé (`lib/dames/etat.ts`, `lib/awale/etat.ts`) :
// aucune dépendance à Prisma, React ou au DOM. Le même module tourne dans
// le navigateur pendant la partie, dans Vitest pour les invariants, et un
// jour côté serveur ou dans une IA, sans une ligne à changer.
//
// Particularité de ce moteur — le premier des trois à comporter du hasard,
// voir docs/superpowers/specs/2026-09-10-ludo-design.md : l'état porte
// aussi le dé courant. Un lancer déjà effectué mais pas encore joué DOIT
// être persisté avec le plateau — sans ce champ, recharger l'écran entre
// le lancer et le déplacement redonnerait un dé, un moyen trivial de
// relancer jusqu'à obtenir un six.

/** Les deux camps. `sud` ouvre toujours la partie, comme à l'Awalé. */
export type Camp = 'sud' | 'nord';

export const CAMPS: readonly Camp[] = ['sud', 'nord'];

export function adversaire(camp: Camp): Camp {
  return camp === 'sud' ? 'nord' : 'sud';
}

/**
 * Un pion, dans l'un des quatre lieux que connaît le jeu :
 * - `enclos` : pas encore sorti, attend un six ;
 * - `circuit` : sur les 52 cases communes ; `progression` compte les pas
 *   parcourus depuis la sortie (0 = la case d'entrée elle-même) ;
 * - `colonne` : dans les 5 cases d'arrivée propres au camp, `progression`
 *   de 0 à 4 ;
 * - `arrivee` : classé, ne bouge plus.
 *
 * Ce découpage en quatre lieux nommés — plutôt qu'une seule distance
 * linéaire 0-57 dans un champ unique — répond directement à l'invariant de
 * conservation de la spec (« enclos, circuit, colonne d'arrivée, ou
 * arrivée ») : un état corrompu qui inventerait un cinquième lieu n'a même
 * pas de type valide. La conversion vers/depuis une distance linéaire, plus
 * pratique pour calculer un déplacement, vit dans `plateau.ts`
 * (`distanceDe` / `pionADistance`).
 */
export type Pion =
  | { readonly zone: 'enclos' }
  | { readonly zone: 'circuit'; readonly progression: number }
  | { readonly zone: 'colonne'; readonly progression: number }
  | { readonly zone: 'arrivee' };

/** Quatre pions par camp, ni plus ni moins — un tuple, pas un tableau ouvert. */
export type QuatrePions = readonly [Pion, Pion, Pion, Pion];

export interface EtatLudo {
  readonly pions: Readonly<Record<Camp, QuatrePions>>;
  readonly trait: Camp;
  /**
   * Le dé déjà lancé mais pas encore joué, ou `null` quand un lancer reste
   * à faire avant tout coup. Voir l'en-tête du fichier : c'est la seule
   * différence structurelle avec les dames et l'Awalé.
   */
  readonly de: number | null;
  /**
   * Nombre de six déjà lancés d'affilée dans le cycle de relances en
   * cours, AVANT le lancer courant — 0, 1 ou 2. Sert uniquement à
   * `lancerDe` (partie.ts) pour appliquer la borne des trois six ; remis à
   * 0 dès qu'un dé différent de six est lancé.
   */
  readonly sixDAffilee: number;
}

/**
 * Lecture d'un pion par son index (0 à 3) dans les quatre d'un camp. Lève
 * — ne rend jamais `undefined` — pour tout index hors bornes :
 * contrairement à `grainesEn` (Awalé) ou `pieceEn` (dames), il n'existe
 * aucune valeur neutre pour « pas de pion ici » — un cinquième pion
 * n'existe simplement pas. Le dépôt active `noUncheckedIndexedAccess`,
 * donc `pions[i]` est `Pion | undefined` ; cette fonction est le seul
 * endroit qui s'en occupe.
 */
export function pionEn(pions: QuatrePions, index: number): Pion {
  const pion = pions[index];
  if (pion === undefined) throw new Error(`Index de pion hors bornes : ${index}`);
  return pion;
}

function enclosDeDepart(): QuatrePions {
  return [{ zone: 'enclos' }, { zone: 'enclos' }, { zone: 'enclos' }, { zone: 'enclos' }];
}

/**
 * La position de départ : les huit pions à l'enclos, `sud` au trait, aucun
 * dé lancé — la partie s'ouvre toujours ainsi, un lancer restant à faire
 * avant le premier coup.
 */
export function positionDepart(): EtatLudo {
  return {
    pions: { sud: enclosDeDepart(), nord: enclosDeDepart() },
    trait: 'sud',
    de: null,
    sixDAffilee: 0,
  };
}
