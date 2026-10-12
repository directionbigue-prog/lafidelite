// The shared `ApiError` -> plain-object bridge for every `/jeu/*` page
// (Lot 2, Tasks 18-23).
//
// Why this is a module and not a helper inside one page: the five pages
// after `/jeu` all need exactly this conversion, and the first version of
// it — written inline in `app/jeu/page.tsx` — shipped a defect where a
// caught `ApiError`'s `.message` was rendered straight to the user. That
// is not merely an English leak: `lib/api.ts` populates `ApiError.message`
// from the response body's `error` field, so the user literally sees
// `NO_ACTIVE_COUPLE` or `Invalid CSRF token` on screen. Centralising the
// conversion here — with the French translation applied at the boundary —
// means the remaining pages inherit the correct behaviour instead of
// copying the bug five more times.
//
// These functions are deliberately free of `fetch`, React and the DOM so
// they stay directly unit-testable in this repo's Node test environment
// (no jsdom / Testing Library — see phase-routes.ts's doc comment).
import { ApiError } from '@/lib/api';
import { coupleErrorMessage } from '@/lib/couples-error-messages';

/** Last-resort French text when an error carries no usable stable code. */
export const GENERIC_ERROR_MESSAGE = 'Une erreur est survenue.';

/**
 * Normalized outcome of a game endpoint call: either the session fields
 * the pages route on, or a stable `code` plus a ready-to-render French
 * `message`. The interpreters in `start-screen.ts` consume this shape so
 * they never touch `ApiError` themselves.
 */
export type GameApiResult =
  | { ok: true; id: string; phase: string }
  | { ok: false; code: string; message: string };

/**
 * True when a caught value carries a stable backend error code worth
 * looking up. An `ApiError` with an EMPTY `code` is not "an unmapped
 * backend code" — it is "no code at all", and its `.message` is then a raw
 * ENGLISH string invented by `lib/api.ts`, never something a user should
 * read.
 *
 * This distinction is load-bearing because `api()` wraps every non-
 * `ApiError` throw before it reaches a caller:
 *
 *   throw new ApiError(0, 'Network error. Please try again.');   // no body
 *
 * with no body, so `code === ''`. A bare `TypeError` therefore never
 * reaches a page's catch block in production — the wrapped `ApiError`
 * does. The same shape arrives for a non-JSON 5xx, whose message is
 * `'The server is temporarily unavailable'`. Before this guard both were
 * rendered verbatim, in English, to a French-speaking user.
 */
function hasStableCode(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code !== '';
}

/**
 * Translate any caught value into French for display.
 *
 * Order matters: the stable `code` is looked up first (per CLAUDE.md,
 * "switch on `.code`, not on `.message`"), and the raw `.message` is used
 * only as the fallback for a code this app has not mapped YET — which
 * keeps genuinely unexpected BACKEND errors debuggable instead of hiding
 * every failure behind one generic sentence. That fallback is deliberately
 * preserved.
 *
 * Everything without a stable code — a non-`ApiError` (a thrown string),
 * and `api()`'s own code-less `ApiError(0, …)` / non-JSON-5xx wrappers —
 * gets the generic French message instead, because their `.message` is
 * English transport text with no diagnostic value to a user.
 */
export function gameErrorMessage(err: unknown): string {
  if (hasStableCode(err)) {
    return coupleErrorMessage(err.code, err.message);
  }
  return GENERIC_ERROR_MESSAGE;
}

/** Success bridge: a resolved game-session response becomes `ok: true`. */
export function toGameApiSuccess(res: { id: string; phase: string }): GameApiResult {
  return { ok: true, id: res.id, phase: res.phase };
}

/**
 * Failure bridge: a caught error becomes `ok: false` carrying BOTH the
 * stable code (so interpreters can branch on `NO_ACTIVE_GAME` /
 * `DISCLAIMER_REQUIRED`) and an already-French message (so no caller can
 * accidentally render the raw one).
 *
 * Same empty-code rule as `gameErrorMessage` — see `hasStableCode`: an
 * `ApiError` with no code yields `code: ''` (which no interpreter can
 * usefully branch on) and the generic French message, never `api()`'s
 * English transport text.
 */
export function toGameApiFailure(err: unknown): GameApiResult {
  if (hasStableCode(err)) {
    return { ok: false, code: err.code, message: coupleErrorMessage(err.code, err.message) };
  }
  return { ok: false, code: '', message: GENERIC_ERROR_MESSAGE };
}
