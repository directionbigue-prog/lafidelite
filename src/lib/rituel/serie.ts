// La série — combien de jours d'affilée le couple s'est retrouvé ici.
//
// UN JOUR COMPTE quand le couple a terminé une partie, OU quand les DEUX
// partenaires ont répondu à la question du jour. Une seule réponse ne compte
// pas : la série est un rituel à deux, et la récompenser pour un geste solo
// apprendrait l'inverse. Le Salon ne compte pas non plus — il reste scellé
// hors de tout ce qui mesure le couple (CLAUDE.md, « Total sealing »).
//
// LE JOUR DE GRÂCE. Un seul jour manqué ne casse pas la série, au plus une
// fois par semaine. Sans lui, un soir de fatigue efface trois semaines, et un
// couple qui perd tout d'un coup ne revient pas recommencer à un — il s'en va.
// Le jour manqué n'est pas compté dans la longueur : la grâce protège la
// série, elle ne l'allonge pas.
//
// Calculée à la lecture, jamais stockée : une série en base devrait être
// remise à jour par un cron à minuit, et un cron raté la ferait mentir. Ici
// elle se déduit des dates d'activité, qui, elles, ne mentent pas.

import { decaler, ecartEnJours } from './jour';

/** Jours de calendrier entre deux grâces : au plus une par semaine. */
export const ECART_MIN_ENTRE_GRACES = 7;

export interface EtatSerie {
  /** Longueur de la série en cours ; 0 si elle est rompue. */
  actuelle: number;
  /** La plus longue série jamais tenue par ce couple. */
  record: number;
  /** Le couple a déjà joué aujourd'hui. */
  joueAujourdhui: boolean;
  /**
   * La série tient encore, mais seulement si le couple joue aujourd'hui :
   * hier était déjà un jour manqué (rattrapé par la grâce), ou bien c'est
   * aujourd'hui que la grâce serait consommée.
   */
  enDanger: boolean;
}

interface Pas {
  jour: string;
  /** Longueur de la série en comptant ce jour. */
  longueur: number;
  /** Dernier jour où une grâce a été consommée dans cette série. */
  derniereGrace: string | null;
}

/** La grâce peut-elle couvrir le jour manqué juste avant `jour` ? */
function graceDisponible(derniereGrace: string | null, jour: string): boolean {
  return derniereGrace === null || ecartEnJours(derniereGrace, jour) >= ECART_MIN_ENTRE_GRACES;
}

/**
 * Parcourt les jours actifs dans l'ordre et rend, pour chacun, la longueur
 * de la série qu'il prolonge. C'est la seule boucle du module : le record,
 * la série en cours et les dates de badges en dérivent tous.
 */
export function parcourir(joursActifs: Iterable<string>): Pas[] {
  const jours = [...new Set(joursActifs)].sort();
  const pas: Pas[] = [];
  for (const jour of jours) {
    const precedent = pas[pas.length - 1];
    if (!precedent) {
      pas.push({ jour, longueur: 1, derniereGrace: null });
      continue;
    }
    const ecart = ecartEnJours(precedent.jour, jour);
    if (ecart === 1) {
      pas.push({ jour, longueur: precedent.longueur + 1, derniereGrace: precedent.derniereGrace });
    } else if (ecart === 2 && graceDisponible(precedent.derniereGrace, jour)) {
      // Le jour manqué est celui d'avant : c'est lui que la grâce couvre.
      pas.push({ jour, longueur: precedent.longueur + 1, derniereGrace: decaler(jour, -1) });
    } else {
      pas.push({ jour, longueur: 1, derniereGrace: null });
    }
  }
  return pas;
}

export function calculerSerie(joursActifs: Iterable<string>, aujourdhui: string): EtatSerie {
  // Un jour « futur » ne peut venir que d'une horloge décalée ; il ne doit ni
  // allonger la série ni faire croire que le couple a déjà joué.
  const pas = parcourir([...joursActifs].filter((j) => j <= aujourdhui));
  const record = pas.reduce((max, p) => Math.max(max, p.longueur), 0);
  const dernier = pas[pas.length - 1];

  if (!dernier) return { actuelle: 0, record: 0, joueAujourdhui: false, enDanger: false };

  const ecart = ecartEnJours(dernier.jour, aujourdhui);
  if (ecart === 0) {
    return { actuelle: dernier.longueur, record, joueAujourdhui: true, enDanger: false };
  }
  if (ecart === 1) {
    // Rien de perdu encore : jouer aujourd'hui prolonge, ne pas jouer
    // consommera la grâce demain si elle est libre.
    return {
      actuelle: dernier.longueur,
      record,
      joueAujourdhui: false,
      enDanger: !graceDisponible(dernier.derniereGrace, decaler(aujourdhui, 1)),
    };
  }
  if (ecart === 2 && graceDisponible(dernier.derniereGrace, aujourdhui)) {
    // Hier a été manqué : la grâce le couvrira, à condition de jouer
    // aujourd'hui. Demain il serait trop tard.
    return { actuelle: dernier.longueur, record, joueAujourdhui: false, enDanger: true };
  }
  return { actuelle: 0, record, joueAujourdhui: false, enDanger: false };
}

/**
 * Le premier jour où une série a atteint `n` jours, ou `null`.
 * Sert à dater les badges de série dans le journal des souvenirs.
 */
export function premierJourAtteignant(joursActifs: Iterable<string>, n: number): string | null {
  return parcourir(joursActifs).find((p) => p.longueur >= n)?.jour ?? null;
}
