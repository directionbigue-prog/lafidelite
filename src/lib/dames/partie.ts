// Le déroulement d'une partie : jouer un coup, savoir si c'est fini.
//
// C'est l'API que consomme l'interface. Elle ne connaît de `coups.ts` que
// `coupsLegaux`, et de ce fichier que ces deux fonctions.
import { coordonnees, rangeePromotion } from './plateau';
import { coupsLegaux } from './coups';
import { type Camp, type Case, type Coup, type EtatPlateau, adversaire, pieceEn } from './etat';

export type Issue = { readonly fini: false } | { readonly fini: true; readonly vainqueur: Camp };

/**
 * Joue `coup` et rend le nouvel état. L'état reçu n'est jamais modifié.
 *
 * C'est ici — et nulle part ailleurs — que la promotion est décidée, sur la
 * seule case d'arrivée. Un pion qui traverse la rangée du fond au milieu
 * d'une rafle et repart reste un pion : promouvoir en vol lui donnerait le
 * déplacement de la dame pour le reste de la séquence, et allongerait des
 * rafles qui n'existent pas.
 */
export function appliquer(etat: EtatPlateau, coup: Coup): EtatPlateau {
  const piece = pieceEn(etat.cases, coup.depart);
  if (piece === null) {
    throw new Error(`Aucune pièce sur la case ${coup.depart}`);
  }

  const cases: Case[] = [...etat.cases];
  cases[coup.depart - 1] = null;
  for (const capturee of coup.captures) cases[capturee - 1] = null;

  const { rangee } = coordonnees(coup.arrivee);
  const dame = piece.dame || rangee === rangeePromotion(piece.camp);
  cases[coup.arrivee - 1] = { camp: piece.camp, dame };

  return { cases, trait: adversaire(piece.camp) };
}

/**
 * Le camp au trait qui n'a aucun coup légal a perdu — qu'il n'ait plus de
 * pièces ou qu'elles soient toutes bloquées. Les deux cas sont une défaite
 * aux dames, et la même absence de coup les décrit.
 */
export function issue(etat: EtatPlateau): Issue {
  if (coupsLegaux(etat).length > 0) return { fini: false };
  return { fini: true, vainqueur: adversaire(etat.trait) };
}
