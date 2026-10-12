// L'état d'une partie de dames, et rien d'autre.
//
// Volontairement sans dépendance : ni Prisma, ni React, ni DOM. C'est ce
// qui permet au même module de tourner dans le navigateur pendant la
// partie, dans Vitest pour le perft, et un jour dans une IA ou sur le
// serveur, sans une ligne à changer.
import { NB_CASES } from './plateau';

export type Camp = 'blanc' | 'noir';

export interface Piece {
  readonly camp: Camp;
  readonly dame: boolean;
}

export type Case = Piece | null;

export interface EtatPlateau {
  /** 50 entrées ; l'index `i` porte la case numéro `i + 1`. */
  readonly cases: readonly Case[];
  readonly trait: Camp;
}

/**
 * Un coup complet, rafle comprise.
 *
 * `paliers` porte les cases d'atterrissage intermédiaires d'une rafle, dans
 * l'ordre où on les traverse — l'interface en a besoin pour animer la
 * séquence et pour ne proposer, après chaque saut, que les continuations de
 * la rafle en cours.
 */
export interface Coup {
  readonly depart: number;
  readonly arrivee: number;
  /** Cases des pièces prises, triées par numéro croissant. */
  readonly captures: readonly number[];
  readonly paliers: readonly number[];
}

export function adversaire(camp: Camp): Camp {
  return camp === 'blanc' ? 'noir' : 'blanc';
}

export function plateauVide(): Case[] {
  return Array.from({ length: NB_CASES }, () => null);
}

/**
 * Lecture d'une case par son numéro officiel (1-50).
 *
 * Rend `null` — jamais `undefined` — pour toute case hors du damier. Le
 * dépôt active `noUncheckedIndexedAccess`, donc `cases[i]` est
 * `Case | undefined` ; cette fonction est le seul endroit qui s'en occupe.
 */
export function pieceEn(cases: readonly Case[], caseNum: number): Case {
  return cases[caseNum - 1] ?? null;
}

export function positionDepart(): EtatPlateau {
  const cases = plateauVide();
  for (let n = 1; n <= 20; n += 1) cases[n - 1] = { camp: 'noir', dame: false };
  for (let n = 31; n <= 50; n += 1) cases[n - 1] = { camp: 'blanc', dame: false };
  // Les blancs ouvrent — standard de la fédération, et l'hypothèse de
  // toutes les valeurs de perft utilisées par Task 7.
  return { cases, trait: 'blanc' };
}
