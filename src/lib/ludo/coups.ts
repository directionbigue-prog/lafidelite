// Génération des coups légaux : quels pions le camp au trait peut jouer
// avec le dé en attente.
//
// Contrairement aux dames et à l'Awalé, un coup ne choisit pas une case ou
// un trou mais un PION : sa destination est entièrement déterminée par sa
// position actuelle et le dé, il n'y a aucun choix de direction à
// arbitrer. `coupsLegaux` rend donc une liste d'index de pions (0 à 3)
// dans le camp au trait, pas de cases.
import { pionEn, type EtatLudo, type Pion } from './etat';
import { DISTANCE_ARRIVEE, distanceDe } from './plateau';

/**
 * Vrai si `pion` peut jouer le dé `de` :
 * - un pion à l'enclos ne sort que sur un six, et atterrit sur sa propre
 *   entrée (`partie.appliquer` s'en charge, cette fonction ne fait que
 *   juger la possibilité) ;
 * - un pion déjà classé (`arrivee`) ne rejoue jamais, il n'y a plus rien à
 *   lui faire jouer ;
 * - tout autre pion avance de `de`, à condition de ne pas dépasser la case
 *   finale (`DISTANCE_ARRIVEE`) — un dé trop grand ne casse rien, il rend
 *   simplement ce pion injouable pour ce lancer précis, il faudra en
 *   choisir un autre.
 */
export function coupPossiblePourPion(pion: Pion, de: number): boolean {
  if (pion.zone === 'enclos') return de === 6;
  if (pion.zone === 'arrivee') return false;
  return distanceDe(pion) + de <= DISTANCE_ARRIVEE;
}

/**
 * Les index (0 à 3) des pions du camp au trait qui peuvent jouer le dé en
 * attente.
 *
 * Rend un tableau vide dès que `etat.de` vaut `null` (rien à jouer avant
 * un lancer) ou qu'aucun pion ne peut bouger avec ce dé — ce second cas
 * est la situation normale que `partie.passerLaMain` traite (la spec la
 * dit fréquente : tous les pions à l'enclos sans six, ou personne d'assez
 * proche de l'arrivée pour le score exact), pas une erreur du moteur.
 */
export function coupsLegaux(etat: EtatLudo): readonly number[] {
  if (etat.de === null) return [];
  const de = etat.de;
  const pions = etat.pions[etat.trait];
  const legaux: number[] = [];
  for (let index = 0; index < pions.length; index += 1) {
    if (coupPossiblePourPion(pionEn(pions, index), de)) legaux.push(index);
  }
  return legaux;
}
