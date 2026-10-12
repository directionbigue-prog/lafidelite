// Les badges du couple, et le journal des souvenirs qui en découle.
//
// TOUT EST DÉRIVÉ DE L'ACTIVITÉ, RIEN N'EST STOCKÉ. Un badge en base devrait
// être attribué au bon moment par la bonne route ; oublier un seul chemin
// d'écriture le rendrait inatteignable sans que rien n'échoue. Ici, un badge
// est une question posée à l'historique — « ce couple a-t-il déjà fait ça,
// et quand ? » — donc un badge ajouté demain s'applique aussi au passé.
//
// LE GARDE-FOU DU PRODUIT TIENT. Aucune réponse passée n'est jamais
// consultable : un souvenir dit « votre première partie, le 3 octobre », il
// ne dit jamais ce que l'un ou l'autre a répondu ce jour-là. Les entrées
// ci-dessous ne portent que des dates, des comptes et des niveaux.

import { parcourir } from './serie';

/** Ce que le couple a fait, réduit à ce que les badges interrogent. */
export interface Activite {
  /** Jour où l'Espace Couple est devenu actif, s'il est connu. */
  forme: string | null;
  /** Une entrée par partie TERMINÉE, triée par jour croissant. */
  parties: readonly { jour: string; niveau: string }[];
  /**
   * Une entrée par question du jour à laquelle LES DEUX ont répondu, triée.
   * `telepathie` : chacun a deviné la réponse de l'autre.
   */
  quotidiennes: readonly { jour: string; telepathie: boolean }[];
}

/** Les jours qui comptent pour la série — voir `serie.ts`. */
export function joursActifs(a: Activite): string[] {
  return [...new Set([...a.parties.map((p) => p.jour), ...a.quotidiennes.map((q) => q.jour)])];
}

export type Famille = 'parties' | 'serie' | 'quotidien' | 'niveau';

export interface DefinitionBadge {
  id: string;
  famille: Famille;
  titre: string;
  description: string;
  cible: number;
  /** Où en est le couple, et le jour où la cible a été atteinte. */
  mesurer(a: Activite): { valeur: number; obtenuLe: string | null };
}

function nieme<T extends { jour: string }>(liste: readonly T[], n: number): string | null {
  return liste[n - 1]?.jour ?? null;
}

function badgeParties(id: string, n: number, titre: string, description: string): DefinitionBadge {
  return {
    id,
    famille: 'parties',
    titre,
    description,
    cible: n,
    mesurer: (a) => ({ valeur: a.parties.length, obtenuLe: nieme(a.parties, n) }),
  };
}

function badgeSerie(id: string, n: number, titre: string, description: string): DefinitionBadge {
  return {
    id,
    famille: 'serie',
    titre,
    description,
    cible: n,
    mesurer: (a) => {
      const pas = parcourir(joursActifs(a));
      // La valeur est la meilleure série tenue ; `etatDesBadges` la plafonne
      // à la cible : « 5 / 7 » se lit comme une progression, « 12 / 7 » non.
      return {
        valeur: pas.reduce((max, p) => Math.max(max, p.longueur), 0),
        obtenuLe: pas.find((p) => p.longueur >= n)?.jour ?? null,
      };
    },
  };
}

function badgeQuotidien(
  id: string,
  n: number,
  titre: string,
  description: string,
): DefinitionBadge {
  return {
    id,
    famille: 'quotidien',
    titre,
    description,
    cible: n,
    mesurer: (a) => ({ valeur: a.quotidiennes.length, obtenuLe: nieme(a.quotidiennes, n) }),
  };
}

/**
 * Un niveau de complicité atteint. Le niveau d'une partie est le niveau
 * CUMULÉ du couple après elle (`computeGameResult`), donc la première partie
 * qui le porte est le jour où le couple l'a franchi.
 */
function badgeNiveau(
  id: string,
  niveau: keyof typeof RANG_NIVEAU,
  titre: string,
  description: string,
): DefinitionBadge {
  const rang = RANG_NIVEAU[niveau];
  return {
    id,
    famille: 'niveau',
    titre,
    description,
    cible: 1,
    mesurer: (a) => {
      // « Au moins » ce niveau : un couple qui saute de Découverte à
      // Fusionnels en une partie a aussi franchi Complices ce jour-là.
      const atteinte = a.parties.find((p) => rangDe(p.niveau) >= rang);
      return { valeur: atteinte ? 1 : 0, obtenuLe: atteinte?.jour ?? null };
    },
  };
}

// L'ordre de l'échelle de `scoring.ts`. Repris ici en RANG seulement, pour
// comparer « au moins Fusionnels » ; les seuils en points restent là-bas.
const RANG_NIVEAU = {
  DECOUVERTE: 0,
  COMPLICES: 1,
  FUSIONNELS: 2,
  INSEPARABLES: 3,
} as const;

/** -1 pour un niveau inconnu : il n'atteint jamais rien plutôt que tout. */
function rangDe(niveau: string): number {
  return Object.prototype.hasOwnProperty.call(RANG_NIVEAU, niveau)
    ? RANG_NIVEAU[niveau as keyof typeof RANG_NIVEAU]
    : -1;
}

export const BADGES: readonly DefinitionBadge[] = [
  badgeParties('premiere-partie', 1, 'Premier pas', 'Votre toute première partie ensemble.'),
  badgeParties('dix-parties', 10, 'Habitués', 'Dix parties jouées ensemble.'),
  badgeParties('vingt-cinq-parties', 25, 'Inarrêtables', 'Vingt-cinq parties jouées ensemble.'),
  badgeSerie('serie-3', 3, 'L’étincelle', 'Trois jours d’affilée ensemble.'),
  badgeSerie('serie-7', 7, 'Une semaine à deux', 'Sept jours d’affilée ensemble.'),
  badgeSerie('serie-30', 30, 'Flamme éternelle', 'Trente jours d’affilée ensemble.'),
  badgeQuotidien(
    'premier-rituel',
    1,
    'Le rituel commence',
    'Votre première question du jour, à deux.',
  ),
  {
    id: 'telepathes',
    famille: 'quotidien',
    titre: 'Télépathes',
    description: 'Chacun a deviné la réponse de l’autre à une question du jour.',
    cible: 1,
    mesurer: (a) => {
      const premier = a.quotidiennes.find((q) => q.telepathie);
      return { valeur: premier ? 1 : 0, obtenuLe: premier?.jour ?? null };
    },
  },
  badgeQuotidien(
    'trente-rituels',
    30,
    'Fidèles au rendez-vous',
    'Trente questions du jour à deux.',
  ),
  badgeNiveau(
    'niveau-complices',
    'COMPLICES',
    'Complices',
    'Vous avez atteint le niveau Complices.',
  ),
  badgeNiveau(
    'niveau-fusionnels',
    'FUSIONNELS',
    'Fusionnels',
    'Vous avez atteint le niveau Fusionnels.',
  ),
  badgeNiveau(
    'niveau-inseparables',
    'INSEPARABLES',
    'Inséparables',
    'Vous avez atteint le sommet : Inséparables.',
  ),
];

export interface EtatBadge {
  id: string;
  famille: Famille;
  titre: string;
  description: string;
  cible: number;
  /** Plafonnée à `cible`. */
  valeur: number;
  obtenuLe: string | null;
}

export function etatDesBadges(a: Activite): EtatBadge[] {
  return BADGES.map((b) => {
    const { valeur, obtenuLe } = b.mesurer(a);
    return {
      id: b.id,
      famille: b.famille,
      titre: b.titre,
      description: b.description,
      cible: b.cible,
      valeur: Math.min(valeur, b.cible),
      obtenuLe,
    };
  });
}

export interface Souvenir {
  jour: string;
  titre: string;
  description: string;
}

/**
 * Le journal des moments forts, du plus récent au plus ancien : la naissance
 * de l'Espace Couple, puis chaque badge obtenu à sa date.
 *
 * Deux souvenirs le même jour gardent l'ordre du registre, pour que le
 * journal ne se réordonne pas d'un chargement à l'autre.
 */
export function souvenirs(
  a: Activite,
  badges: readonly EtatBadge[] = etatDesBadges(a),
): Souvenir[] {
  const entrees: (Souvenir & { ordre: number })[] = [];
  if (a.forme) {
    entrees.push({
      jour: a.forme,
      titre: 'Votre Espace Couple est né',
      description: 'Le jour où vous vous êtes retrouvés ici.',
      ordre: -1,
    });
  }
  badges.forEach((b, i) => {
    if (b.obtenuLe) {
      entrees.push({ jour: b.obtenuLe, titre: b.titre, description: b.description, ordre: i });
    }
  });
  return entrees
    .sort((x, y) => (x.jour === y.jour ? y.ordre - x.ordre : x.jour < y.jour ? 1 : -1))
    .map(({ jour, titre, description }) => ({ jour, titre, description }));
}

/**
 * Les badges obtenus PILE ce jour-là — ceux qu'un écran de fin de partie
 * peut célébrer sans en rejouer d'anciens.
 */
export function nouveauxBadges(badges: readonly EtatBadge[], jour: string): EtatBadge[] {
  return badges.filter((b) => b.obtenuLe === jour);
}
