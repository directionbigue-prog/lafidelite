import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  GENERIC_ERROR_MESSAGE,
  gameErrorMessage,
  toGameApiSuccess,
  toGameApiFailure,
} from './api-result';

// The regression these tests exist for: `lib/api.ts` populates
// `ApiError.message` from the response body's `error` field, so rendering
// a caught error's raw `.message` shows a French-speaking user a stable
// code like `NO_ACTIVE_COUPLE`. Every assertion below pins the French
// string itself, not merely "some string" — a test asserting only that a
// message exists would stay green through exactly that bug.

/**
 * Build an ApiError exactly the way `lib/api.ts` does — `code` is derived
 * from `body.error`, and the default `message` mirrors the real-world
 * shape this module exists to defend against: the message IS the code.
 */
function apiError(code: string, message = code): ApiError {
  return new ApiError(400, message, { error: code });
}

/**
 * Build the code-less `ApiError` that `lib/api.ts` throws for a transport
 * failure — `new ApiError(0, <english>)` with NO body, so `code === ''`
 * (api.ts:200-208). This is the value a page's catch block actually
 * receives for a network error / timeout / offline: `api()` wraps every
 * non-`ApiError` throw, so a bare `TypeError` never gets through.
 */
function transportError(message: string): ApiError {
  return new ApiError(0, message);
}

describe('gameErrorMessage', () => {
  it('returns the mapped French string for a known code, never the raw code', () => {
    const msg = gameErrorMessage(apiError('NO_ACTIVE_COUPLE'));
    expect(msg).toBe("Vous n'avez pas encore d'Espace Couple.");
    expect(msg).not.toContain('NO_ACTIVE_COUPLE');
  });

  it('translates every game code the routes can return', () => {
    expect(gameErrorMessage(apiError('DISCLAIMER_REQUIRED'))).toBe(
      'Vous devez tous les deux accepter les règles du jeu avant de commencer.',
    );
    expect(gameErrorMessage(apiError('NO_ACTIVE_GAME'))).toBe('Aucune partie en cours.');
    expect(gameErrorMessage(apiError('NO_JOKERS_LEFT'))).toBe(
      "Vous n'avez plus de joker pour cette partie.",
    );
  });

  it('falls back to the raw message for an unmapped code, keeping it debuggable', () => {
    expect(gameErrorMessage(apiError('SOME_UNMAPPED_CODE', 'raw detail'))).toBe('raw detail');
  });

  it('returns the generic French message for a non-ApiError (network failure)', () => {
    expect(gameErrorMessage(new TypeError('Failed to fetch'))).toBe(GENERIC_ERROR_MESSAGE);
    expect(gameErrorMessage('a thrown string')).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('never renders api()’s English transport text for a code-less ApiError', () => {
    // These four English strings are exactly what `lib/api.ts` puts in
    // `.message` when there is no backend `error` code to read — three
    // transport wrappers plus the non-JSON-5xx branch (api.ts:184-187).
    // An empty `code` is "no code at all", not "an unmapped backend code",
    // so the raw-message fallback must NOT apply.
    for (const english of [
      'Network error. Please try again.',
      'The request timed out. Check your connection and try again.',
      'No internet connection. Check your network and try again.',
      'The server is temporarily unavailable',
    ]) {
      expect(gameErrorMessage(transportError(english))).toBe(GENERIC_ERROR_MESSAGE);
    }
  });

  it('still surfaces the raw message for an ApiError WITH an unmapped, non-empty code', () => {
    // The useful half of the fallback: a genuinely unexpected BACKEND
    // error stays debuggable. Only the empty-code case changed.
    expect(gameErrorMessage(apiError('BRAND_NEW_BACKEND_CODE', 'something specific'))).toBe(
      'something specific',
    );
  });
});

describe('toGameApiSuccess', () => {
  it('carries id and phase through as an ok result', () => {
    expect(toGameApiSuccess({ id: 'g1', phase: 'PASS_DEVICE' })).toEqual({
      ok: true,
      id: 'g1',
      phase: 'PASS_DEVICE',
    });
  });
});

describe('toGameApiFailure', () => {
  it('keeps the stable code for branching AND translates the message for display', () => {
    expect(toGameApiFailure(apiError('NO_ACTIVE_GAME'))).toEqual({
      ok: false,
      code: 'NO_ACTIVE_GAME',
      message: 'Aucune partie en cours.',
    });
  });

  it('never leaks the raw error code into the displayable message', () => {
    const result = toGameApiFailure(apiError('DISCLAIMER_REQUIRED'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('DISCLAIMER_REQUIRED');
      expect(result.message).not.toContain('DISCLAIMER_REQUIRED');
      expect(result.message).toBe(
        'Vous devez tous les deux accepter les règles du jeu avant de commencer.',
      );
    }
  });

  it('gives a non-ApiError an empty code so no interpreter branches on it', () => {
    expect(toGameApiFailure(new TypeError('Failed to fetch'))).toEqual({
      ok: false,
      code: '',
      message: GENERIC_ERROR_MESSAGE,
    });
  });

  it('gives api()’s code-less transport ApiError the generic message, not its English text', () => {
    expect(toGameApiFailure(transportError('Network error. Please try again.'))).toEqual({
      ok: false,
      code: '',
      message: GENERIC_ERROR_MESSAGE,
    });
    expect(toGameApiFailure(transportError('The server is temporarily unavailable'))).toEqual({
      ok: false,
      code: '',
      message: GENERIC_ERROR_MESSAGE,
    });
  });

  it('still surfaces the raw message for an ApiError WITH an unmapped, non-empty code', () => {
    expect(toGameApiFailure(apiError('BRAND_NEW_BACKEND_CODE', 'something specific'))).toEqual({
      ok: false,
      code: 'BRAND_NEW_BACKEND_CODE',
      message: 'something specific',
    });
  });
});
