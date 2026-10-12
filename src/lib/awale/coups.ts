// Génération des coups légaux, et le semis qui leur sert de fondation.
//
// Contrairement aux dames, il n'y a ni prise obligatoire à arbitrer ni
// rafle à dérouler : la seule restriction sur le choix du trou est
// l'obligation de nourrir un adversaire affamé (voir la spec,
// docs/superpowers/specs/2026-09-09-awale-design.md). Elle est
// intentionnellement ici et pas dans `partie.ts` — un coup qui ne nourrit
// pas n'est simplement pas un coup légal, au même titre qu'un trou vide.
import { type Camp, type EtatAwale, NB_TROUS, adversaire, campDuTrou, grainesEn } from './etat';

/** Les douze trous après semis, avant toute prise. */
export interface Semis {
  readonly trous: readonly number[];
  /** Le trou où tombe la dernière graine — point de départ de la prise. */
  readonly dernier: number;
}

/**
 * Sème les graines du trou `depart` dans l'anneau, une par une, dans le
 * sens 0 → 11 → 0.
 *
 * **Le trou de départ est sauté** à chaque tour complet — dès douze
 * graines. Sans ce saut, un trou de douze graines finirait avec une graine
 * au lieu de zéro : la graine « en trop » du tour complet doit continuer
 * jusqu'au trou suivant, pas revenir chez elle.
 *
 * Ne prend rien : `partie.appliquer` décide de la prise à partir du trou
 * d'arrivée rendu ici. Partagée avec `nourrit` ci-dessous, qui a besoin de
 * la même mécanique pour juger si un coup nourrit l'adversaire.
 */
export function semer(trous: readonly number[], depart: number): Semis {
  const graines = grainesEn(trous, depart);
  const resultat = [...trous];
  resultat[depart] = 0;

  let position = depart;
  let restantes = graines;
  let dernier = depart;
  while (restantes > 0) {
    position = (position + 1) % NB_TROUS;
    if (position === depart) continue; // le trou de départ ne reçoit jamais de graine
    resultat[position] = grainesEn(resultat, position) + 1;
    dernier = position;
    restantes -= 1;
  }
  return { trous: resultat, dernier };
}

/** Somme des graines des trous appartenant à `camp`. */
export function sommeCote(trous: readonly number[], camp: Camp): number {
  let somme = 0;
  for (let trou = 0; trou < NB_TROUS; trou += 1) {
    if (campDuTrou(trou) === camp) somme += grainesEn(trous, trou);
  }
  return somme;
}

/**
 * Vrai si semer depuis `depart` dépose au moins une graine côté `camp`.
 *
 * Jugé sur le semis seul, **avant** toute prise — c'est ce que « nourrir »
 * veut dire ici. Un coup qui atteint l'adversaire puis se fait aussitôt
 * reprendre en cascade (parce que la dernière graine porte un trou à deux
 * ou trois) reste un coup nourrissant : la règle 3 autorise explicitement
 * cette prise, donc la restreindre ici la contredirait.
 */
export function nourrit(trous: readonly number[], depart: number, camp: Camp): boolean {
  const { trous: apres } = semer(trous, depart);
  return sommeCote(apres, camp) > sommeCote(trous, camp);
}

/**
 * Les trous que le joueur au trait peut jouer.
 *
 * Un trou lui appartenant et non vide ; et, quand l'adversaire n'a aucune
 * graine, seulement ceux qui lui en donnent au moins une (semis compris,
 * prise ou pas). Un tableau vide signifie soit qu'aucun trou du joueur
 * n'est jouable, soit que tous échouent à nourrir un adversaire affamé —
 * les deux cas sont la famine que `partie.issue` traite.
 */
export function coupsLegaux(etat: EtatAwale): readonly number[] {
  const camp = etat.trait;
  const jouables: number[] = [];
  for (let trou = 0; trou < NB_TROUS; trou += 1) {
    if (campDuTrou(trou) === camp && grainesEn(etat.trous, trou) > 0) jouables.push(trou);
  }
  if (jouables.length === 0) return [];

  const adv = adversaire(camp);
  if (sommeCote(etat.trous, adv) > 0) return jouables;

  return jouables.filter((trou) => nourrit(etat.trous, trou, adv));
}
