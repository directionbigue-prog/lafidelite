// Le jeu à distance — deux téléphones au lieu d'un, pendant l'appel vidéo.
//
// LE MOTEUR NE CHANGE PAS. La partie reste celle du pass-and-play : un seul
// `GameSession`, un `activePlayerRole` qui dit à qui est le tour, et des
// réponses attribuées par ce rôle (CLAUDE.md, « pass-and-play »). Ce qui
// change, c'est seulement ce qu'affiche chaque téléphone :
//
//   · celui dont c'est le tour voit « À toi » et répond ;
//   · l'autre voit « Awa répond… » et attend, au lieu de « Passe le
//     téléphone à Awa » — il n'y a pas de téléphone à passer ;
//   · dès que la partie avance, le téléphone qui attendait suit tout seul.
//
// L'attente se résout par une relecture de `GET /api/games/current`,
// déclenchée par un signal envoyé dans l'appel vidéo (instantané) ET par un
// sondage lent (le filet, si le signal se perd). Ce module décide quoi faire
// d'une relecture ; il ne lit rien lui-même, pour rester testable.
//
// Le secret des réponses tient comme avant : le serveur ne montre la réponse
// de l'autre qu'une fois la manche COMPLETED (`response-shaping.ts`), quel
// que soit le téléphone qui demande.

import { routeForPhase } from '@/lib/game/phase-routes';

export interface SessionLue {
  id: string;
  phase: string;
  activePlayerRole: string;
  currentQuestionNumber: number;
}

/** `GET /api/games/current` a répondu 404 : plus de partie en cours. */
export const PLUS_DE_PARTIE = 'plus-de-partie' as const;

export type DecisionAttente =
  | { kind: 'attendre' }
  | { kind: 'a-toi' }
  | { kind: 'aller'; path: string }
  | { kind: 'erreur' };

/**
 * Écran « passe » en mode à distance : faut-il attendre, jouer, ou suivre la
 * partie ailleurs ?
 *
 * PASS_DEVICE et ANSWERING appartiennent à cet écran tant que le tour est à
 * l'autre : ANSWERING veut dire « l'autre a l'écran de question ouvert », et
 * c'est exactement ce qu'on attend.
 */
export function decisionAttente(
  lu: SessionLue | typeof PLUS_DE_PARTIE,
  viewerRole: string,
): DecisionAttente {
  if (lu === PLUS_DE_PARTIE) return { kind: 'aller', path: '/jeu' };
  if (lu.phase === 'PASS_DEVICE' || lu.phase === 'ANSWERING') {
    if (viewerRole !== 'CREATOR' && viewerRole !== 'PARTNER') return { kind: 'erreur' };
    return lu.activePlayerRole === viewerRole ? { kind: 'a-toi' } : { kind: 'attendre' };
  }
  const path = routeForPhase(lu.id, lu.phase);
  return path ? { kind: 'aller', path } : { kind: 'erreur' };
}

export type DecisionRevelation =
  | { kind: 'rester' }
  | { kind: 'aller'; path: string }
  | { kind: 'erreur' };

/**
 * Écran de révélation de manche en mode à distance : l'un des deux a cliqué
 * « manche suivante » ; l'autre doit suivre.
 *
 * Deux pièges que cette fonction ferme :
 *   · `GET /api/games/current` résout ROUND_INTRO en PASS_DEVICE à la
 *     lecture. Une question 1 en PASS_DEVICE est donc le début d'une manche,
 *     et le téléphone qui suit doit voir l'intro de manche, pas sauter à
 *     « À toi ».
 *   · Après la DERNIÈRE manche, la partie est COMPLETED et `current` répond
 *     404. Ce n'est pas une erreur : c'est la fin, et l'écran des résultats
 *     de CETTE partie est la suite.
 */
export function decisionRevelation(
  lu: SessionLue | typeof PLUS_DE_PARTIE,
  sessionId: string,
): DecisionRevelation {
  if (lu === PLUS_DE_PARTIE) return { kind: 'aller', path: `/jeu/${sessionId}/resultats` };
  if (lu.phase === 'ROUND_REVEAL') return { kind: 'rester' };
  if (
    (lu.phase === 'PASS_DEVICE' || lu.phase === 'ROUND_INTRO') &&
    lu.currentQuestionNumber === 1
  ) {
    return { kind: 'aller', path: `/jeu/${lu.id}/manche-intro` };
  }
  const path = routeForPhase(lu.id, lu.phase);
  return path ? { kind: 'aller', path } : { kind: 'erreur' };
}

/**
 * L'écran de question ne doit s'ouvrir que sur le téléphone du joueur actif.
 * Sur l'autre, il appellerait `start-turn` — et lancerait le chronomètre du
 * bonus de vitesse pour quelqu'un qui n'a pas le téléphone en main.
 */
export function questionSurLeMauvaisTelephone(
  modeDistance: boolean,
  activePlayerRole: string,
  viewerRole: string,
): boolean {
  return modeDistance && viewerRole !== '' && activePlayerRole !== viewerRole;
}

/** Le message qu'un téléphone envoie à l'autre quand la partie avance. */
export const SIGNAL_PARTIE = 'cf:partie';

export function estSignalPartie(data: unknown): boolean {
  return (
    typeof data === 'object' && data !== null && (data as { type?: unknown }).type === SIGNAL_PARTIE
  );
}
