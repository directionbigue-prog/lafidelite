// Géométrie du plateau de Ludo : le circuit commun, les colonnes d'arrivée
// privées, et les deux cases sûres.
//
// Aucune notion de tour, de dé ou de camp au trait ici — uniquement des
// calculs sur les positions, réutilisés par `coups.ts` (légalité) et
// `partie.ts` (déplacement et prise). Le pendant, pour les dames, est
// `lib/dames/plateau.ts`.
import type { Camp, Pion } from './etat';

/** Le circuit commun aux deux camps : 52 cases numérotées 0 à 51. */
export const TAILLE_CIRCUIT = 52;

/** La colonne d'arrivée propre à chaque camp : 5 cases privées, jamais partagées. */
export const TAILLE_COLONNE = 5;

/** Quatre pions par camp — l'invariant de conservation de la spec. */
export const NB_PIONS = 4;

/**
 * Distance totale à parcourir depuis la sortie de l'enclos (case d'entrée
 * comprise, distance 0) jusqu'à l'arrivée : 52 cases de circuit (distances
 * 0 à 51) puis 5 cases de colonne (distances 52 à 56), et l'arrivée
 * elle-même est le 57e pas. Un pion ne peut jamais dépasser cette
 * distance : un dé trop grand rend le coup impossible pour LUI, pas pour
 * la partie — il faudra en jouer un autre.
 */
export const DISTANCE_ARRIVEE = TAILLE_CIRCUIT + TAILLE_COLONNE;

/**
 * La case sur laquelle atterrit tout pion qui sort de l'enclos : sa propre
 * entrée, distance 0. Ce n'est pas un cas de `avancer` (qui suppose un
 * pion déjà sorti) — la sortie POSE la distance à 0, elle ne l'additionne
 * pas.
 */
export const SORTIE_ENCLOS = { zone: 'circuit', progression: 0 } as const satisfies Pion;

/**
 * La case d'entrée de chaque camp sur le circuit commun — diamétralement
 * opposées, comme l'exige la spec. `sud` ouvre en case 0, `nord` juste en
 * face, à la moitié du circuit.
 */
export function entreeDuCamp(camp: Camp): number {
  return camp === 'sud' ? 0 : TAILLE_CIRCUIT / 2;
}

/**
 * La case absolue du circuit commun occupée par un pion de `camp` à la
 * progression `progression` (0 à 51 : distance parcourue depuis la
 * sortie). Le circuit est un anneau, mais un pion ne le parcourt jamais
 * plus d'une fois — ce module ne module donc qu'une seule fois, pas en
 * boucle.
 */
export function caseAbsolue(camp: Camp, progression: number): number {
  return (entreeDuCamp(camp) + progression) % TAILLE_CIRCUIT;
}

/**
 * Une case sûre est une case d'entrée — l'une ou l'autre, peu importe le
 * camp qui s'y trouve. Un pion qui s'y trouve ne peut jamais y être pris.
 * C'est la seule sécurité du plateau : la spec écarte explicitement les
 * cases étoilées supplémentaires que d'autres variantes ajoutent.
 */
export function estCaseSure(caseCircuit: number): boolean {
  return caseCircuit === 0 || caseCircuit === TAILLE_CIRCUIT / 2;
}

/**
 * La distance totale parcourue depuis la sortie de l'enclos, pour un pion
 * qui en est déjà sorti (jamais appelée sur un pion à l'enclos — il n'a
 * pas encore de distance). Fonction réciproque de `pionADistance` : les
 * deux sont testées ensemble en aller-retour dans `plateau.test.ts`.
 */
export function distanceDe(pion: Exclude<Pion, { zone: 'enclos' }>): number {
  if (pion.zone === 'circuit') return pion.progression;
  if (pion.zone === 'colonne') return TAILLE_CIRCUIT + pion.progression;
  return DISTANCE_ARRIVEE;
}

/**
 * Convertit une distance parcourue en lieu : les 52 premiers pas sont sur
 * le circuit commun, les 5 suivants dans la colonne d'arrivée, et le
 * dernier pas atteint l'arrivée elle-même.
 *
 * Ne valide pas les bornes — c'est `coups.coupPossiblePourPion` qui refuse
 * tout coup menant à une distance supérieure à `DISTANCE_ARRIVEE` avant
 * même d'appeler cette fonction. Un appel ici avec une distance hors
 * bornes serait un bug de l'appelant, pas un cas que cette fonction doit
 * deviner (même choix que `semer` aux dames et à l'Awalé).
 */
export function pionADistance(distance: number): Pion {
  if (distance < TAILLE_CIRCUIT) return { zone: 'circuit', progression: distance };
  if (distance < DISTANCE_ARRIVEE) {
    return { zone: 'colonne', progression: distance - TAILLE_CIRCUIT };
  }
  return { zone: 'arrivee' };
}

/**
 * Avance un pion déjà sorti de l'enclos de `de` pas. Ne connaît pas le
 * camp : la progression est relative à la sortie de CE pion, la
 * conversion en case absolue du circuit (pour juger une prise) est le
 * travail de `caseAbsolue`, pas de celle-ci.
 */
export function avancer(pion: Exclude<Pion, { zone: 'enclos' }>, de: number): Pion {
  return pionADistance(distanceDe(pion) + de);
}
