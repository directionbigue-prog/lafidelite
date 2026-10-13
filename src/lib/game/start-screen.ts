// Pure decision logic for `/jeu` (Lot 2, Task 18) — the game's start
// screen. Every branch the task brief lists (no ACTIVE couple -> redirect;
// couple ACTIVE but disclaimer not accepted by both -> gate; existing
// session -> route by phase) is extracted here as an exported, directly
// unit-testable function so the page component (`src/app/jeu/page.tsx`)
// can stay a thin `useEffect` + render wrapper. See phase-routes.ts's doc
// comment and Timer.tsx's for the repo-wide rationale: no jsdom / Testing
// Library dependency, so branching logic must be pure and covered with
// exact-value assertions rather than loose substring matches on markup.
import { routeForPhase } from './phase-routes';
import type { GameApiResult } from './api-result';

// `GameApiResult` is defined in api-result.ts (alongside the ApiError
// bridge that builds it) and re-exported here so the pages that already
// import their interpreters from this module don't need a second import.
export type { GameApiResult };

const UNKNOWN_PHASE_MESSAGE =
  'Cette partie est dans un état inconnu. Réessayez ou contactez le support.';

export type CoupleMeCouple =
  | null
  | { status: 'PENDING' }
  | {
      status: 'ACTIVE';
      partnerName: string | null;
      // Which side of the couple the CALLER is. Needed to tell whose
      // acceptance flag is whose — see `disclaimerGateState`.
      viewerRole?: string;
      // Surfaced by GET /api/couples/me as booleans (never the raw
      // timestamps) so this screen can gate on load, rather than
      // discovering DISCLAIMER_REQUIRED only after the user clicks
      // "Nouvelle partie" and eats a 403.
      disclaimerAcceptedByCreator: boolean;
      disclaimerAcceptedByPartner: boolean;
    };

/**
 * Step 2 of the brief: `GET /api/couples/me` -> redirect decision. Only an
 * ACTIVE couple may proceed past the start screen; anything else (no
 * couple at all, or a still-PENDING invite) sends the user back to the
 * pairing flow — the brief's rule is stated as a single "no ACTIVE couple"
 * check, not a per-status branch, so PENDING is folded into the same
 * redirect rather than routed to `/couple/attente`.
 *
 * Returns the path to redirect to, or `null` when the couple is ACTIVE and
 * the page should proceed to the game-session check.
 *
 * Un compte d'administration sans aucun couple va à /admin plutôt qu'au
 * parcours d'appariement (décision du 13/10/2026) : il vient superviser, pas
 * jouer, et l'obliger à inviter un partenaire n'a aucun sens. Ce n'est qu'un
 * aiguillage — chaque route /api/admin/* revérifie le rôle. Un admin qui a
 * lui-même commencé un couple (PENDING) garde le parcours normal.
 */
export function coupleGateRedirect(couple: CoupleMeCouple, role?: string): string | null {
  if (couple !== null && couple.status === 'ACTIVE') return null;
  if (couple === null && (role === 'ADMIN' || role === 'SUPERADMIN')) return '/admin';
  return '/couple/creer';
}

export type GamesCurrentOutcome =
  | { kind: 'no-game' }
  | { kind: 'resume'; path: string }
  | { kind: 'error'; message: string };

/**
 * Step 4 of the brief: interprets `GET /api/games/current`.
 *  - 404 `NO_ACTIVE_GAME` is the NORMAL "nothing in progress" case, not an
 *    error to display — it maps to `'no-game'`, which the page renders as
 *    the "Nouvelle partie" CTA.
 *  - 200 with a recognized phase -> `'resume'`, carrying the exact
 *    `/jeu/:id/...` path to route to for that phase.
 *  - 200 with an unrecognized phase, or any other failure code -> `'error'`
 *    with a ready-to-render French message. An unrecognized phase is
 *    treated as an error, not a silent fallback — see `routeForPhase`'s
 *    doc comment for why guessing a route is unsafe.
 */
export function interpretGamesCurrent(result: GameApiResult): GamesCurrentOutcome {
  if (!result.ok) {
    if (result.code === 'NO_ACTIVE_GAME') return { kind: 'no-game' };
    // `result.message` is already French: `toGameApiFailure` translates at
    // the boundary, so no interpreter needs to look the code up again.
    return { kind: 'error', message: result.message };
  }
  const path = routeForPhase(result.id, result.phase);
  if (path === null) return { kind: 'error', message: UNKNOWN_PHASE_MESSAGE };
  return { kind: 'resume', path };
}

export type CreateGameOutcome =
  | { kind: 'started'; path: string }
  | { kind: 'disclaimer-gate' }
  /**
   * The account's one free game is spent. A kind of its own rather than a
   * plain error: this is not a failure to retry, it is a state the screen
   * has something to SAY about, and a red alert above a picker the player
   * can keep pressing says the opposite.
   */
  | { kind: 'free-game-used' }
  | { kind: 'error'; message: string };

/**
 * Steps 3-4 of the brief: interprets `POST /api/games` (the "Nouvelle
 * partie" CTA's click handler). The backend is the sole source of truth on
 * whether both partners accepted the disclaimer — this page never mirrors
 * that check client-side; it reacts to the `DISCLAIMER_REQUIRED` (403)
 * response by showing the inline gate.
 */
export function interpretCreateGame(result: GameApiResult): CreateGameOutcome {
  if (!result.ok) {
    if (result.code === 'DISCLAIMER_REQUIRED') return { kind: 'disclaimer-gate' };
    if (result.code === 'FREE_GAME_USED') return { kind: 'free-game-used' };
    // Already French — see the note in `interpretGamesCurrent`.
    return { kind: 'error', message: result.message };
  }
  const path = routeForPhase(result.id, result.phase);
  if (path === null) return { kind: 'error', message: UNKNOWN_PHASE_MESSAGE };
  return { kind: 'started', path };
}

/**
 * The disclaimer gate's "J'accepte" button calls
 * `POST /api/couples/disclaimer/accept`, whose response reports each
 * partner's acceptance independently (Task 12). Both must be true before
 * the gate can hand off to game creation — a single acceptance (even the
 * current user's own, just recorded) is never enough. Extracted as its own
 * function so this AND is asserted directly rather than re-derived inline
 * in the component.
 */
export function bothDisclaimersAccepted(
  acceptedByCreator: boolean,
  acceptedByPartner: boolean,
): boolean {
  return acceptedByCreator === true && acceptedByPartner === true;
}

/**
 * Step 3 of the brief: decide, ON LOAD, whether the disclaimer gate must
 * be shown — i.e. the couple is ACTIVE but at least one partner has not
 * accepted yet. Without this the gate is only reachable by clicking
 * "Nouvelle partie" and being rejected with a 403, which is the wrong
 * order: the user should see what is blocking them before they act.
 *
 * Deliberately FAILS CLOSED. The `=== true` comparisons (and
 * `bothDisclaimersAccepted`'s) are not redundant at runtime: an older
 * server, a partial response, or a shape change would leave these fields
 * `undefined`, and coercing that to "accepted" would let a pair start
 * playing without ever seeing the disclaimer. Anything that is not
 * literally `true` counts as not accepted, so an unknown state shows the
 * gate rather than skipping it. The backend re-checks regardless
 * (`POST /api/games` returns 403 DISCLAIMER_REQUIRED), so this is
 * defence in depth, not the only guard.
 */
export function needsDisclaimerGate(couple: CoupleMeCouple): boolean {
  if (couple === null || couple.status !== 'ACTIVE') return false;
  return !bothDisclaimersAccepted(
    couple.disclaimerAcceptedByCreator === true,
    couple.disclaimerAcceptedByPartner === true,
  );
}

/**
 * Which face the disclaimer gate should show (Lot 2, Task 23):
 *
 *  - `'none'`    — nothing blocks play (both accepted, or there is no
 *                  ACTIVE couple to gate).
 *  - `'waiting'` — THIS viewer has already accepted; the other partner
 *                  has not. Asking them to accept again would be
 *                  nonsense, so the gate shows a waiting state instead.
 *  - `'accept'`  — this viewer still has to accept.
 *
 * Knowing which of the two flags belongs to the viewer is what
 * `viewerRole` (from `GET /api/couples/me`) is for. Before this existed,
 * a partner who had already accepted was shown the "J'accepte" button
 * again on every reload — harmless, since the endpoint is idempotent,
 * but it told them something untrue about the state of their couple.
 *
 * An unrecognized `viewerRole` resolves to `'accept'`, not `'waiting'`:
 * showing the button one time too many is recoverable, whereas stranding
 * someone in a waiting screen they can never leave is not.
 */
export type DisclaimerGateState = 'none' | 'accept' | 'waiting';

export function disclaimerGateState(
  couple: CoupleMeCouple,
  viewerRole: string,
): DisclaimerGateState {
  if (!needsDisclaimerGate(couple)) return 'none';
  // needsDisclaimerGate already established this is an ACTIVE couple.
  const active = couple as Extract<CoupleMeCouple, { status: 'ACTIVE' }>;
  const viewerAccepted =
    viewerRole === 'CREATOR'
      ? active.disclaimerAcceptedByCreator === true
      : viewerRole === 'PARTNER'
        ? active.disclaimerAcceptedByPartner === true
        : false;
  return viewerAccepted ? 'waiting' : 'accept';
}
