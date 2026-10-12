// Les dérivations d'affichage : la grille de lettres révélées, la liste des
// définitions avec leur statut, et la géométrie qui relie un emplacement à
// ses cases.
//
// Pures, comme `marquage.ts` du Mot — jamais mêlées à `etat.ts` (la forme
// de l'état) ni `partie.ts` (les règles), pour la même raison : ce sont des
// VUES sur l'état, pas des règles. `Grille.tsx` ne fait que rendre ce que
// ces fonctions calculent.
import { estTrouve } from './partie';
import {
  matriceLettres,
  tousLesEmplacements,
  trouverGrille,
  type Emplacement,
  type EtatMotsCroises,
  type Joueur,
} from './etat';

/** Vrai si `emplacement` couvre la case (ligne, colonne) de la grille 5×5. */
export function emplacementCouvre(
  emplacement: Emplacement,
  ligne: number,
  colonne: number,
): boolean {
  return emplacement.direction === 'horizontal'
    ? ligne === emplacement.index * 2
    : colonne === emplacement.index * 2;
}

/**
 * Les emplacements qui couvrent la case (ligne, colonne) : un seul pour les
 * cases « sparse » des lignes 1 et 3 (colonnes 0, 2, 4 uniquement), deux
 * pour toute case des lignes 0, 2, 4 — elle appartient alors à la fois à
 * son mot horizontal et, si sa colonne est paire, à un mot vertical.
 * Aucun pour une case noire.
 */
function emplacementsCouvrant(ligne: number, colonne: number): readonly Emplacement[] {
  return tousLesEmplacements().filter((emplacement) =>
    emplacementCouvre(emplacement, ligne, colonne),
  );
}

export type CelluleAffichee =
  | { readonly type: 'noire' }
  | { readonly type: 'lettre'; readonly lettre: string | null }; // null = pas encore trouvée

/**
 * La grille 5×5 telle qu'affichée : une lettre n'apparaît que si l'un des
 * mots qui la portent a déjà été trouvé — c'est tout l'intérêt des
 * croisements (voir la spec, « Les lettres déjà posées... aident pour les
 * suivants »). Les cases noires restent noires, quel que soit l'état.
 */
export function grilleAffichee(etat: EtatMotsCroises): readonly (readonly CelluleAffichee[])[] {
  const grille = trouverGrille(etat.idGrille);
  const matrice = matriceLettres(grille);

  const lignes: CelluleAffichee[][] = [];
  for (let ligne = 0; ligne < 5; ligne += 1) {
    const rangeeMatrice = matrice[ligne];
    const rangee: CelluleAffichee[] = [];
    for (let colonne = 0; colonne < 5; colonne += 1) {
      const couvrants = emplacementsCouvrant(ligne, colonne);
      if (couvrants.length === 0) {
        rangee.push({ type: 'noire' });
        continue;
      }
      const trouvee = couvrants.some((emplacement) => estTrouve(etat, emplacement));
      const lettre = rangeeMatrice === undefined ? undefined : rangeeMatrice[colonne];
      rangee.push({ type: 'lettre', lettre: trouvee && lettre !== undefined ? lettre : null });
    }
    lignes.push(rangee);
  }
  return lignes;
}

export interface DefinitionAffichee extends Emplacement {
  readonly definition: string;
  readonly trouve: boolean;
  readonly trouvePar: Joueur | null;
}

/** Les six définitions de la grille jouée, dans l'ordre horizontal 0-2 puis vertical 0-2. */
export function definitionsAffichees(etat: EtatMotsCroises): readonly DefinitionAffichee[] {
  const grille = trouverGrille(etat.idGrille);
  return tousLesEmplacements().map((emplacement) => {
    const liste = emplacement.direction === 'horizontal' ? grille.horizontaux : grille.verticaux;
    const { definition } = liste[emplacement.index];
    const trouve = etat.trouves.find(
      (t) => t.direction === emplacement.direction && t.index === emplacement.index,
    );
    return {
      ...emplacement,
      definition,
      trouve: trouve !== undefined,
      trouvePar: trouve?.trouvePar ?? null,
    };
  });
}
