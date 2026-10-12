import { describe, it, expect } from 'vitest';
import {
  coupleGateRedirect,
  interpretGamesCurrent,
  interpretCreateGame,
  bothDisclaimersAccepted,
  needsDisclaimerGate,
  disclaimerGateState,
  type CoupleMeCouple,
} from './start-screen';

/** An ACTIVE couple fixture; both disclaimers accepted unless overridden. */
function activeCouple(over: Partial<Extract<CoupleMeCouple, { status: 'ACTIVE' }>> = {}) {
  return {
    status: 'ACTIVE' as const,
    partnerName: 'Awa',
    disclaimerAcceptedByCreator: true,
    disclaimerAcceptedByPartner: true,
    ...over,
  };
}

describe('coupleGateRedirect', () => {
  it('redirects to /couple/creer when there is no couple at all', () => {
    expect(coupleGateRedirect(null)).toBe('/couple/creer');
  });

  it('redirects to /couple/creer when the couple is still PENDING', () => {
    expect(coupleGateRedirect({ status: 'PENDING' })).toBe('/couple/creer');
  });

  it('does not redirect when the couple is ACTIVE', () => {
    expect(coupleGateRedirect(activeCouple({ partnerName: 'Awa' }))).toBeNull();
  });

  it('does not redirect for an ACTIVE couple even with a null partner name', () => {
    expect(coupleGateRedirect(activeCouple({ partnerName: null }))).toBeNull();
  });
});

describe('interpretGamesCurrent', () => {
  it('treats 404 NO_ACTIVE_GAME as the normal "no game in progress" case, not an error', () => {
    expect(
      interpretGamesCurrent({ ok: false, code: 'NO_ACTIVE_GAME', message: 'No game.' }),
    ).toEqual({ kind: 'no-game' });
  });

  it('resumes to the exact /passe route for a PASS_DEVICE session', () => {
    expect(interpretGamesCurrent({ ok: true, id: 'g1', phase: 'PASS_DEVICE' })).toEqual({
      kind: 'resume',
      path: '/jeu/g1/passe',
    });
  });

  it('resumes to the exact /question route for an ANSWERING session', () => {
    expect(interpretGamesCurrent({ ok: true, id: 'g1', phase: 'ANSWERING' })).toEqual({
      kind: 'resume',
      path: '/jeu/g1/question',
    });
  });

  it('resumes to the exact /manche-revelee route for a ROUND_REVEAL session', () => {
    expect(interpretGamesCurrent({ ok: true, id: 'g1', phase: 'ROUND_REVEAL' })).toEqual({
      kind: 'resume',
      path: '/jeu/g1/manche-revelee',
    });
  });

  it('resumes to the exact /manche-intro route for a ROUND_INTRO session', () => {
    expect(interpretGamesCurrent({ ok: true, id: 'g1', phase: 'ROUND_INTRO' })).toEqual({
      kind: 'resume',
      path: '/jeu/g1/manche-intro',
    });
  });

  it('resumes to the exact /resultats route for a COMPLETE session', () => {
    expect(interpretGamesCurrent({ ok: true, id: 'g1', phase: 'COMPLETE' })).toEqual({
      kind: 'resume',
      path: '/jeu/g1/resultats',
    });
  });

  it('reports an error (not a navigation) for an unrecognized phase, rather than guessing a route', () => {
    const outcome = interpretGamesCurrent({ ok: true, id: 'g1', phase: 'SOME_FUTURE_PHASE' });
    expect(outcome.kind).toBe('error');
  });

  // Translation happens exactly once, at the ApiError boundary in
  // `toGameApiFailure` (pinned in api-result.test.ts). By the time a
  // GameApiResult reaches an interpreter its `message` is already French,
  // so the interpreter passes it through rather than looking the code up
  // a second time.
  it('passes an already-translated failure message through unchanged', () => {
    expect(
      interpretGamesCurrent({
        ok: false,
        code: 'NO_ACTIVE_COUPLE',
        message: "Vous n'avez pas encore d'Espace Couple.",
      }),
    ).toEqual({ kind: 'error', message: "Vous n'avez pas encore d'Espace Couple." });
  });
});

describe('interpretCreateGame', () => {
  it('shows the disclaimer gate on a DISCLAIMER_REQUIRED (403) response', () => {
    expect(
      interpretCreateGame({
        ok: false,
        code: 'DISCLAIMER_REQUIRED',
        message: 'Both partners must accept the disclaimer before playing.',
      }),
    ).toEqual({ kind: 'disclaimer-gate' });
  });

  it('starts and routes to the exact /passe path for a freshly created PASS_DEVICE session', () => {
    expect(interpretCreateGame({ ok: true, id: 'g2', phase: 'PASS_DEVICE' })).toEqual({
      kind: 'started',
      path: '/jeu/g2/passe',
    });
  });

  it('routes a resumed session (200, idempotent POST) by its actual current phase', () => {
    expect(interpretCreateGame({ ok: true, id: 'g2', phase: 'ROUND_INTRO' })).toEqual({
      kind: 'started',
      path: '/jeu/g2/manche-intro',
    });
  });

  it('reports an error for an unrecognized phase rather than guessing a route', () => {
    const outcome = interpretCreateGame({ ok: true, id: 'g2', phase: 'SOME_FUTURE_PHASE' });
    expect(outcome.kind).toBe('error');
  });

  it('passes an already-translated failure message through unchanged', () => {
    expect(
      interpretCreateGame({
        ok: false,
        code: 'NO_ACTIVE_COUPLE',
        message: "Vous n'avez pas encore d'Espace Couple.",
      }),
    ).toEqual({ kind: 'error', message: "Vous n'avez pas encore d'Espace Couple." });
  });
});

describe('needsDisclaimerGate', () => {
  it('does not gate when both partners have accepted', () => {
    expect(needsDisclaimerGate(activeCouple())).toBe(false);
  });

  it('gates when only the creator has accepted', () => {
    expect(needsDisclaimerGate(activeCouple({ disclaimerAcceptedByPartner: false }))).toBe(true);
  });

  it('gates when only the partner has accepted', () => {
    expect(needsDisclaimerGate(activeCouple({ disclaimerAcceptedByCreator: false }))).toBe(true);
  });

  it('gates when neither has accepted', () => {
    expect(
      needsDisclaimerGate(
        activeCouple({ disclaimerAcceptedByCreator: false, disclaimerAcceptedByPartner: false }),
      ),
    ).toBe(true);
  });

  // Fail-closed: an older server or a shape change could omit these
  // fields entirely. Treating `undefined` as "accepted" would let a pair
  // start playing without ever seeing the disclaimer, so anything that is
  // not literally `true` must gate.
  it('gates when the acceptance flags are missing from the response', () => {
    const malformed = { status: 'ACTIVE', partnerName: 'Awa' } as unknown as CoupleMeCouple;
    expect(needsDisclaimerGate(malformed)).toBe(true);
  });

  it('does not gate for a null or PENDING couple (those redirect instead)', () => {
    expect(needsDisclaimerGate(null)).toBe(false);
    expect(needsDisclaimerGate({ status: 'PENDING' })).toBe(false);
  });
});

describe('disclaimerGateState', () => {
  it('does not gate at all once both partners have accepted', () => {
    expect(disclaimerGateState(activeCouple({ viewerRole: 'CREATOR' }), 'CREATOR')).toBe('none');
  });

  it('asks the creator to accept when they have not', () => {
    expect(
      disclaimerGateState(
        activeCouple({ disclaimerAcceptedByCreator: false, viewerRole: 'CREATOR' }),
        'CREATOR',
      ),
    ).toBe('accept');
  });

  it('asks the partner to accept when they have not', () => {
    expect(
      disclaimerGateState(
        activeCouple({ disclaimerAcceptedByPartner: false, viewerRole: 'PARTNER' }),
        'PARTNER',
      ),
    ).toBe('accept');
  });

  // The regression this function exists for: before it, a viewer who had
  // already accepted was shown the "J'accepte" button again on every
  // reload, because the page only knew it had to gate — not whose
  // signature was missing.
  it('shows the waiting state to a creator who accepted while the partner has not', () => {
    expect(
      disclaimerGateState(
        activeCouple({ disclaimerAcceptedByPartner: false, viewerRole: 'CREATOR' }),
        'CREATOR',
      ),
    ).toBe('waiting');
  });

  it('shows the waiting state to a partner who accepted while the creator has not', () => {
    expect(
      disclaimerGateState(
        activeCouple({ disclaimerAcceptedByCreator: false, viewerRole: 'PARTNER' }),
        'PARTNER',
      ),
    ).toBe('waiting');
  });

  // Both directions matter: reading the wrong flag would strand the
  // person who still has to sign in a waiting screen forever, while
  // asking the one who already signed to sign again.
  it('reads the flag belonging to the viewer, not the other partner', () => {
    const onlyCreatorSigned = activeCouple({ disclaimerAcceptedByPartner: false });
    expect(disclaimerGateState(onlyCreatorSigned, 'CREATOR')).toBe('waiting');
    expect(disclaimerGateState(onlyCreatorSigned, 'PARTNER')).toBe('accept');
  });

  // Fails toward the recoverable state: showing the button once too often
  // is harmless (the endpoint is idempotent); a waiting screen nobody can
  // leave is not.
  it('falls back to asking for acceptance when the viewer role is unknown', () => {
    expect(disclaimerGateState(activeCouple({ disclaimerAcceptedByPartner: false }), '')).toBe(
      'accept',
    );
    expect(
      disclaimerGateState(activeCouple({ disclaimerAcceptedByPartner: false }), 'SOMETHING_ELSE'),
    ).toBe('accept');
  });

  it('does not gate a null or PENDING couple', () => {
    expect(disclaimerGateState(null, 'CREATOR')).toBe('none');
    expect(disclaimerGateState({ status: 'PENDING' }, 'CREATOR')).toBe('none');
  });
});

describe('bothDisclaimersAccepted', () => {
  it('is false when only the current user just accepted', () => {
    expect(bothDisclaimersAccepted(true, false)).toBe(false);
  });

  it('is false when only the partner had accepted', () => {
    expect(bothDisclaimersAccepted(false, true)).toBe(false);
  });

  it('is false when neither has accepted', () => {
    expect(bothDisclaimersAccepted(false, false)).toBe(false);
  });

  it('is true only once both partners have accepted', () => {
    expect(bothDisclaimersAccepted(true, true)).toBe(true);
  });
});

describe('interpretCreateGame — the free game', () => {
  it('gives the spent free game a state of its own, not a retryable error', () => {
    // An `error` here would render as a red alert above a picker the
    // player can press again, forever, on a request that can only ever be
    // refused the same way.
    expect(
      interpretCreateGame({ ok: false, code: 'FREE_GAME_USED', message: 'peu importe' }),
    ).toEqual({ kind: 'free-game-used' });
  });

  it('still treats an unrelated refusal as an error to show', () => {
    expect(
      interpretCreateGame({ ok: false, code: 'NO_ACTIVE_COUPLE', message: 'Pas de couple.' }),
    ).toEqual({ kind: 'error', message: 'Pas de couple.' });
  });
});
