// Phase -> route mapping for the pass-and-play game engine's `/jeu/[id]/*`
// screens (Lot 2, Task 18). Shared by every `/jeu/*` page (this task's
// start screen, and Tasks 19-23's phase screens) so the mapping — and the
// decision on what to do with a phase this build doesn't recognize — lives
// in exactly one place instead of being re-derived per page.
//
// Kept as a pure, directly-testable module (no React, no fetch) per this
// lot's component-testing decision: the repo ships no jsdom / Testing
// Library, so every branch a page takes must be covered here with
// exact-value Vitest assertions, with the page itself staying a thin
// wrapper that calls these functions and renders their result.
//
// `GameSession.phase` values are the backend's source of truth — see
// `src/lib/server/game/state-machine.ts`.

export type GamePhase = 'PASS_DEVICE' | 'ANSWERING' | 'ROUND_REVEAL' | 'ROUND_INTRO' | 'COMPLETE';

const PHASE_SEGMENT: Record<GamePhase, string> = {
  PASS_DEVICE: 'passe',
  ANSWERING: 'question',
  ROUND_REVEAL: 'manche-revelee',
  ROUND_INTRO: 'manche-intro',
  COMPLETE: 'resultats',
};

const KNOWN_PHASES: ReadonlySet<string> = new Set(Object.keys(PHASE_SEGMENT));

/** Narrows an API-supplied `phase` string to `GamePhase`, if recognized. */
export function isKnownGamePhase(phase: string): phase is GamePhase {
  return KNOWN_PHASES.has(phase);
}

/**
 * Maps a game session id + `phase` (as returned by the API — a plain,
 * unnarrowed string) to the `/jeu/:id/...` route that phase should be
 * displayed on.
 *
 * Returns `null` for any phase this frontend build doesn't recognize (e.g.
 * a future backend phase this build predates). Callers MUST treat `null`
 * as "do not navigate — show an error instead" rather than falling back to
 * a guessed or default route. This is a deliberate decision, not an
 * oversight: silently routing an unrecognized phase to, say, `/passe`
 * would strand the player on the wrong screen for their actual game state.
 */
export function routeForPhase(gameId: string, phase: string): string | null {
  if (!isKnownGamePhase(phase)) return null;
  return `/jeu/${gameId}/${PHASE_SEGMENT[phase]}`;
}

/**
 * Which phases `/jeu/:id/manche-intro` may legitimately render.
 *
 * `PASS_DEVICE` is overloaded: it is the phase at the start of a round
 * (because `GET /api/games/current` resolves `ROUND_INTRO` away on read)
 * AND the phase between every question hand-off inside a round. Accepting
 * it unconditionally lets a Back button mid-round re-show the round-intro
 * card; rejecting it outright makes the intro screen unreachable, since
 * `ROUND_INTRO` never survives the endpoint.
 *
 * `currentQuestionNumber` separates the two cleanly: a round's intro is
 * only ever legitimate before its FIRST question.
 */
export function mancheIntroExpectedPhases(currentQuestionNumber: number): GamePhase[] {
  return currentQuestionNumber === 1 ? ['ROUND_INTRO', 'PASS_DEVICE'] : ['ROUND_INTRO'];
}

export type PhaseGuardDecision =
  | { kind: 'stay' }
  | { kind: 'redirect'; path: string }
  | { kind: 'error' };

/**
 * The boot guard every `/jeu/:id/*` screen runs: does the session's actual
 * phase belong on THIS screen?
 *
 * Without it a screen renders whatever it fetched regardless of where the
 * game actually is — a browser Back button from the reveal happily shows
 * "Manche 2 sur 3" for a round that finished minutes ago, and the player
 * walks forward through several stale screens before anything corrects
 * them. Two of the four screens had this guard and two did not, which is
 * the kind of gap only a whole-branch reading surfaces.
 *
 * `'error'` (not a guessed route) for an unrecognized phase, for the same
 * reason `routeForPhase` returns `null` — see its doc comment.
 */
export function guardPhase(
  gameId: string,
  phase: string,
  expected: readonly GamePhase[],
): PhaseGuardDecision {
  if (!isKnownGamePhase(phase)) return { kind: 'error' };
  if (expected.includes(phase)) return { kind: 'stay' };
  const path = routeForPhase(gameId, phase);
  return path === null ? { kind: 'error' } : { kind: 'redirect', path };
}
