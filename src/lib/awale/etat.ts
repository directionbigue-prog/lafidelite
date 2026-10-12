// L'état d'une partie d'Awalé, et rien d'autre.
//
// Comme pour les dames (`lib/dames/etat.ts`) : aucune dépendance à Prisma,
// React ou au DOM. Le même module tourne dans le navigateur pendant la
// partie, dans Vitest pour les invariants, et un jour côté serveur ou dans
// une IA, sans une ligne à changer.

/** Les deux camps. `sud` ouvre toujours la partie. */
export type Camp = 'sud' | 'nord';

/** Douze trous, numérotés 0 à 11 dans le sens du semis. */
export const NB_TROUS = 12;

export interface EtatAwale {
  /** 12 entrées ; l'index `i` porte le trou numéro `i`, de 0 à 11. */
  readonly trous: readonly number[];
  /** Graines déjà engrangées par chaque camp — jamais remises en jeu. */
  readonly greniers: Readonly<Record<Camp, number>>;
  readonly trait: Camp;
}

export function adversaire(camp: Camp): Camp {
  return camp === 'sud' ? 'nord' : 'sud';
}

/**
 * Le camp propriétaire d'un trou : `sud` possède 0 à 5, `nord` possède 6 à
 * 11. Le semis va toujours de 0 vers 11 puis revient à 0 — c'est un anneau,
 * mais la propriété d'un trou, elle, ne boucle pas.
 */
export function campDuTrou(trou: number): Camp {
  return trou < 6 ? 'sud' : 'nord';
}

/**
 * Lecture d'un trou par son numéro (0-11). Rend 0 — jamais `undefined` —
 * pour tout trou hors plateau. Le dépôt active `noUncheckedIndexedAccess`,
 * donc `trous[i]` est `number | undefined` ; cette fonction est le seul
 * endroit qui s'en occupe.
 */
export function grainesEn(trous: readonly number[], trou: number): number {
  return trous[trou] ?? 0;
}

/**
 * La position de départ : quatre graines par trou, deux greniers vides,
 * `sud` au trait — la partie s'ouvre toujours ainsi.
 */
export function positionDepart(): EtatAwale {
  return {
    trous: Array.from({ length: NB_TROUS }, () => 4),
    greniers: { sud: 0, nord: 0 },
    trait: 'sud',
  };
}
