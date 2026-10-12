// Le déroulement d'une partie : jouer un coup, savoir si c'est fini.
//
// C'est l'API que consomme l'interface. Elle ne connaît de `coups.ts` que
// `semer`, `sommeCote` et `coupsLegaux` — comme aux dames, la génération
// des coups et son arbitrage restent dans un seul fichier.
import { coupsLegaux, semer, sommeCote } from './coups';
import { type Camp, type EtatAwale, NB_TROUS, adversaire, campDuTrou, grainesEn } from './etat';

/**
 * `vainqueur` vaut `null` pour un match nul — la seule issue de l'Awalé qui
 * n'a pas de camp gagnant (vingt-quatre partout, ou une famine qui laisse
 * les deux greniers à égalité).
 */
export type Issue =
  | { readonly fini: false }
  | { readonly fini: true; readonly vainqueur: Camp | null };

/** Crédite `valeur` graines au grenier de `camp`, sans toucher l'autre. */
function crediter(
  greniers: Readonly<Record<Camp, number>>,
  camp: Camp,
  valeur: number,
): Readonly<Record<Camp, number>> {
  return camp === 'sud'
    ? { sud: greniers.sud + valeur, nord: greniers.nord }
    : { sud: greniers.sud, nord: greniers.nord + valeur };
}

/**
 * Joue `trou` et rend le nouvel état. L'état reçu n'est jamais modifié.
 *
 * Sème, puis prend en cascade depuis le dernier trou : si la dernière
 * graine tombe dans un trou adverse et le porte à exactement deux ou trois,
 * ces graines rejoignent le grenier du joueur au trait ; on examine ensuite
 * le trou précédent, et on continue tant qu'il est encore adverse et à deux
 * ou trois. On s'arrête au premier trou qui échoue à la condition, ou en
 * quittant la rangée adverse — les deux arrêts sont distincts et aucun ne
 * doit se substituer à l'autre.
 *
 * Une prise qui viderait entièrement le camp adverse est autorisée et
 * compte pleinement : c'est le choix explicite des règles classiques
 * retenues (voir la spec), pas les règles de tournoi Abapa qui annuleraient
 * la prise dans ce cas.
 *
 * Ne vérifie que « le trou appartient au joueur au trait et n'est pas
 * vide » : c'est `coupsLegaux` qui décide en amont de l'obligation de
 * nourrir. Appeler `appliquer` sur un trou qu'elle a exclu est un bug de
 * l'appelant, pas un cas que cette fonction doit deviner.
 */
export function appliquer(etat: EtatAwale, trou: number): EtatAwale {
  const camp = etat.trait;
  if (campDuTrou(trou) !== camp) {
    throw new Error(`Le trou ${trou} n'appartient pas à ${camp}`);
  }
  if (grainesEn(etat.trous, trou) === 0) {
    throw new Error(`Le trou ${trou} est vide`);
  }

  const { trous: apresSemis, dernier } = semer(etat.trous, trou);

  const adv = adversaire(camp);
  const trousFinal = [...apresSemis];
  let position = dernier;
  let capture = 0;
  while (campDuTrou(position) === adv) {
    const graines = grainesEn(trousFinal, position);
    if (graines !== 2 && graines !== 3) break;
    capture += graines;
    trousFinal[position] = 0;
    position = (position - 1 + NB_TROUS) % NB_TROUS;
  }

  return {
    trous: trousFinal,
    greniers: crediter(etat.greniers, camp, capture),
    trait: adv,
  };
}

/**
 * La partie est finie dès que vingt-cinq graines ou plus reposent dans un
 * grenier — la majorité absolue des quarante-huit est acquise, la suite ne
 * peut rien y changer, même s'il reste des coups jouables — ou à
 * vingt-quatre partout.
 *
 * Sinon, elle est finie quand le camp au trait n'a aucun coup légal :
 * qu'il n'ait plus une seule graine, ou que la faim de l'adversaire lui
 * interdise tout coup possible (aucun de ses trous non vides ne le
 * nourrit). Dans ce dernier cas, chaque camp récolte les graines restant de
 * son côté avant la comparaison finale des greniers — cette fonction ne
 * modifie pas `etat`, elle simule cette récolte pour ne trancher que qui
 * gagne ; c'est `appliquer` qui aurait, coup par coup, mené le plateau
 * jusque-là.
 */
export function issue(etat: EtatAwale): Issue {
  if (etat.greniers.sud >= 25) return { fini: true, vainqueur: 'sud' };
  if (etat.greniers.nord >= 25) return { fini: true, vainqueur: 'nord' };
  if (etat.greniers.sud === 24 && etat.greniers.nord === 24) {
    return { fini: true, vainqueur: null };
  }
  if (coupsLegaux(etat).length > 0) return { fini: false };

  const sud = etat.greniers.sud + sommeCote(etat.trous, 'sud');
  const nord = etat.greniers.nord + sommeCote(etat.trous, 'nord');
  if (sud === nord) return { fini: true, vainqueur: null };
  return { fini: true, vainqueur: sud > nord ? 'sud' : 'nord' };
}
