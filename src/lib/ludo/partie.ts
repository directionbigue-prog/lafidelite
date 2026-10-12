// Déroulement d'une partie : lancer le dé, jouer le pion choisi, passer la
// main quand aucun coup n'est possible, savoir si la partie est finie.
//
// C'est l'API que consommera l'écran. Elle ne connaît de `coups.ts` que
// `coupPossiblePourPion` — comme aux dames et à l'Awalé, la génération des
// coups et son arbitrage restent séparés du déroulement du tour.
import { coupPossiblePourPion } from './coups';
import {
  adversaire,
  CAMPS,
  pionEn,
  type Camp,
  type EtatLudo,
  type Pion,
  type QuatrePions,
} from './etat';
import { avancer, caseAbsolue, estCaseSure, SORTIE_ENCLOS } from './plateau';

/**
 * Tire une face de dé (1 à 6) à partir d'une source d'aléa injectée —
 * jamais `Math.random()` directement dans le moteur. `alea` rend un
 * flottant dans [0, 1), comme `Math.random`, pour que chaque partie de
 * test puisse fixer une graine et rejouer n'importe quel échec (voir
 * `invariants.test.ts`).
 */
export function valeurDe(alea: () => number): number {
  return Math.floor(alea() * 6) + 1;
}

/**
 * Lance le dé pour le camp au trait. Lève si un dé est déjà en attente —
 * relancer sans avoir joué le premier serait exactement le bug que l'état
 * persisté (`etat.de`, voir `etat.ts`) existe pour empêcher : on ne relance
 * jamais tant qu'un coup reste à jouer.
 *
 * Sur un six, incrémente le compteur de six d'affilée. Le TROISIÈME six
 * d'affilée annule le tour séance tenante : il n'est jamais joué, la main
 * passe directement à l'adversaire. Sans cette borne, une partie assez
 * chanceuse (ou un test assez malchanceux) ne rendrait jamais la main.
 */
export function lancerDe(etat: EtatLudo, alea: () => number): EtatLudo {
  if (etat.de !== null) {
    throw new Error('Un dé est déjà en attente d’être joué');
  }
  const valeur = valeurDe(alea);
  if (valeur !== 6) {
    return { ...etat, de: valeur, sixDAffilee: 0 };
  }
  const sixDAffilee = etat.sixDAffilee + 1;
  if (sixDAffilee === 3) {
    return { ...etat, trait: adversaire(etat.trait), de: null, sixDAffilee: 0 };
  }
  return { ...etat, de: 6, sixDAffilee };
}

/**
 * Passe la main sans jouer, parce qu'aucun pion du camp au trait ne peut
 * jouer le dé en attente (`coups.coupsLegaux` rend un tableau vide). Ce
 * n'est ni une erreur ni une fin de partie — la spec le dit explicitement
 * fréquent. Le plateau ne change pas, seuls le trait, le dé et le compteur
 * de six sont remis à zéro pour le camp qui prend la main.
 */
export function passerLaMain(etat: EtatLudo): EtatLudo {
  return { ...etat, trait: adversaire(etat.trait), de: null, sixDAffilee: 0 };
}

/**
 * Remplace le pion `index` d'un tuple de quatre par `pion`, sans toucher
 * aux trois autres. Écrit en toutes lettres (pas de `.map` suivi d'un
 * transtypage) : `Array.prototype.map` rend un `Pion[]` de longueur
 * inconnue pour le compilateur, qui refuse alors la conversion vers le
 * tuple à quatre éléments `QuatrePions` — ce n'est pas une gymnastique de
 * style, c'est ce que `noUncheckedIndexedAccess` et l'absence de `any`
 * imposent ici.
 */
function remplacerPion(pions: QuatrePions, index: number, pion: Pion): QuatrePions {
  return [
    index === 0 ? pion : pions[0],
    index === 1 ? pion : pions[1],
    index === 2 ? pion : pions[2],
    index === 3 ? pion : pions[3],
  ];
}

/**
 * Renvoie les pions adverses présents sur `caseCircuit` à l'enclos — sauf
 * si c'est une case sûre, où l'on ne prend jamais personne. Ne touche à
 * rien d'autre : les pions adverses ailleurs sur le plateau (circuit,
 * colonne ou déjà arrivés) restent inchangés à l'identique.
 *
 * Une colonne d'arrivée est strictement privée à son camp — deux camps ne
 * peuvent jamais s'y croiser — donc seuls les pions adverses en zone
 * `circuit` sont même candidats à la comparaison. Même remarque qu'à
 * `remplacerPion` sur l'écriture en toutes lettres plutôt qu'un `.map`.
 */
function reprendre(
  pionsAdverses: QuatrePions,
  campAdverse: Camp,
  caseCircuit: number,
): QuatrePions {
  if (estCaseSure(caseCircuit)) return pionsAdverses;
  const repris = (pion: Pion): Pion =>
    pion.zone === 'circuit' && caseAbsolue(campAdverse, pion.progression) === caseCircuit
      ? { zone: 'enclos' }
      : pion;
  return [
    repris(pionsAdverses[0]),
    repris(pionsAdverses[1]),
    repris(pionsAdverses[2]),
    repris(pionsAdverses[3]),
  ];
}

/**
 * Joue le pion `index` du camp au trait avec le dé en attente, et rend le
 * nouvel état. L'état reçu n'est jamais modifié.
 *
 * Lève si aucun dé n'est en attente, ou si ce pion précis ne peut pas
 * jouer ce dé (`coups.coupPossiblePourPion` en décide) — appeler
 * `appliquer` sur un pion que `coupsLegaux` a exclu est un bug de
 * l'appelant, pas un cas que cette fonction doit deviner (même choix
 * qu'aux dames et à l'Awalé).
 *
 * Un six fait rejouer le MÊME camp : `trait` reste inchangé, `de` est
 * remis à `null` pour forcer un nouveau lancer, et `sixDAffilee` — déjà
 * incrémenté par `lancerDe` au moment du lancer — n'est pas retouché ici.
 * Tout autre dé passe la main et remet le compteur à zéro pour le camp
 * suivant. Une prise ne change rien à cette règle : la spec est explicite,
 * elle ne donne jamais de tour supplémentaire.
 */
export function appliquer(etat: EtatLudo, index: number): EtatLudo {
  if (etat.de === null) {
    throw new Error('Aucun dé en attente : lancer avant de jouer');
  }
  const de = etat.de;
  const camp = etat.trait;
  const pion = pionEn(etat.pions[camp], index);
  if (!coupPossiblePourPion(pion, de)) {
    throw new Error(`Le pion ${index} de ${camp} ne peut pas jouer ce ${de}`);
  }

  const nouveauPion = pion.zone === 'enclos' ? SORTIE_ENCLOS : avancer(pion, de);
  const campAdverse = adversaire(camp);
  let pionsAdverses = etat.pions[campAdverse];
  if (nouveauPion.zone === 'circuit') {
    pionsAdverses = reprendre(
      pionsAdverses,
      campAdverse,
      caseAbsolue(camp, nouveauPion.progression),
    );
  }

  const rejoue = de === 6;
  return {
    pions: {
      ...etat.pions,
      [camp]: remplacerPion(etat.pions[camp], index, nouveauPion),
      [campAdverse]: pionsAdverses,
    },
    trait: rejoue ? camp : campAdverse,
    de: null,
    sixDAffilee: rejoue ? etat.sixDAffilee : 0,
  };
}

export type Issue = { readonly fini: false } | { readonly fini: true; readonly vainqueur: Camp };

/**
 * La partie est finie dès qu'un camp a ses quatre pions à l'arrivée. Pas
 * de match nul par les règles du jeu lui-même, contrairement à l'Awalé —
 * la nulle par accord que l'écran peut proposer reste une décision
 * d'écran, hors du moteur (voir la spec, section « hors périmètre »).
 */
export function issue(etat: EtatLudo): Issue {
  for (const camp of CAMPS) {
    if (etat.pions[camp].every((pion) => pion.zone === 'arrivee')) {
      return { fini: true, vainqueur: camp };
    }
  }
  return { fini: false };
}
