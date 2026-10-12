// Géométrie du damier international 10×10.
//
// Le damier a 100 cases, mais on ne joue que sur les 50 sombres. La
// notation officielle de la fédération les numérote 1 à 50, de gauche à
// droite puis de haut en bas — c'est cette numérotation que manipule tout
// le moteur, et c'est elle qu'on lit dans la littérature. Les coordonnées
// (rangée, colonne) ne servent qu'à ce fichier : personne d'autre n'a
// besoin de savoir qu'un damier est un carré.

export const NB_CASES = 50;

export interface Coordonnees {
  readonly rangee: number; // 0 (haut) à 9 (bas)
  readonly colonne: number; // 0 (gauche) à 9 (droite)
}

/** Un pas diagonal. `dr` descend quand il vaut 1, `dc` va à droite. */
export interface Direction {
  readonly dr: -1 | 1;
  readonly dc: -1 | 1;
}

export const DIRECTIONS: readonly Direction[] = [
  { dr: -1, dc: -1 },
  { dr: -1, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: 1, dc: 1 },
];

export function coordonnees(caseNum: number): Coordonnees {
  const i = caseNum - 1;
  const rangee = Math.floor(i / 5);
  // Une rangée paire porte ses cases jouables en colonnes impaires, et
  // réciproquement — c'est ce décalage qui fait le damier.
  const colonne = 2 * (i % 5) + (rangee % 2 === 0 ? 1 : 0);
  return { rangee, colonne };
}

/** `null` hors du damier, ou sur une case claire (jamais jouable). */
export function numeroCase(rangee: number, colonne: number): number | null {
  if (rangee < 0 || rangee > 9 || colonne < 0 || colonne > 9) return null;
  const pariteAttendue = rangee % 2 === 0 ? 1 : 0;
  if (colonne % 2 !== pariteAttendue) return null;
  return rangee * 5 + Math.floor(colonne / 2) + 1;
}

/** La case atteinte en partant de `caseNum`, `distance` pas dans `dir`. */
export function voisine(caseNum: number, dir: Direction, distance = 1): number | null {
  const { rangee, colonne } = coordonnees(caseNum);
  return numeroCase(rangee + dir.dr * distance, colonne + dir.dc * distance);
}

/** Les noirs partent du haut et descendent ; les blancs font l'inverse. */
export function sensAvance(camp: 'blanc' | 'noir'): -1 | 1 {
  return camp === 'noir' ? 1 : -1;
}

/** La rangée du fond adverse, où un pion qui s'arrête devient dame. */
export function rangeePromotion(camp: 'blanc' | 'noir'): 0 | 9 {
  return camp === 'blanc' ? 0 : 9;
}
