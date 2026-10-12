// Unit tests for `/jeu/[id]/question`'s pure decision logic (Lot 2,
// Task 20).
//
// The task brief names a `page.test.tsx`, but this repo runs Vitest with
// `environment: 'node'` and ships neither jsdom nor Testing Library, and
// the project owner ruled that no such dependency may be added. The
// decisions are therefore extracted into `question-screen.ts` and asserted
// here on exact values — a test that cannot fail when the rule it names is
// broken is worse than no test at all.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/api';
// Imported from the modules that OWN these values, so the assertions
// below check identity rather than restating a literal.
import { TIMER_MS } from '@/lib/server/game/scoring';
import { QUESTIONS_PER_ROUND as MACHINE_QUESTIONS_PER_ROUND } from '@/lib/server/game/state-machine';
import {
  QUESTION_DURATION_MS,
  QUESTIONS_PER_ROUND,
  UNKNOWN_PHASE_MESSAGE,
  EMPTY_SELECTION,
  isMiroirRound,
  currentAnswerStep,
  stepCopy,
  applySelection,
  bootDecisionForPhase,
  selectedOptionIdForStep,
  canSubmitAnswer,
  buildAnswerBody,
  jokersRemainingForRole,
  canUseJoker,
  nextPathAfterSubmit,
  interpretSkipFailure,
  type AnswerSelection,
} from './question-screen';

const OWN = 'opt-own';
const PREDICTION = 'opt-prediction';

function selection(ownOptionId: string | null, predictionOptionId: string | null): AnswerSelection {
  return { ownOptionId, predictionOptionId };
}

describe('constants', () => {
  // These used to assert `toBe(45_000)` and `toBe(5)` — restatements of
  // the literals they were meant to protect, green through exactly the
  // drift they were written to catch.
  //
  // Both values are now RE-EXPORTED from the server modules that own
  // them, which makes drift structurally impossible rather than merely
  // detected. That also makes `expect(QUESTION_DURATION_MS).toBe(TIMER_MS)`
  // true by construction — a second tautology, just a subtler one. So the
  // assertion worth keeping is the one that can actually fail: that this
  // module still re-exports instead of re-declaring a literal.
  it('re-exports the server constants instead of restating them', () => {
    const source = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'question-screen.ts'),
      'utf8',
    );
    expect(source).toMatch(/export\s*\{[^}]*TIMER_MS as QUESTION_DURATION_MS[^}]*\}\s*from/);
    expect(source).toMatch(/export\s*\{[^}]*QUESTIONS_PER_ROUND[^}]*\}\s*from/);
    // The regression: a re-introduced local literal.
    expect(source).not.toMatch(/const\s+QUESTION_DURATION_MS\s*=/);
    expect(source).not.toMatch(/const\s+QUESTIONS_PER_ROUND\s*=/);
  });

  it('resolves to the same values the server uses', () => {
    expect(QUESTION_DURATION_MS).toBe(TIMER_MS);
    expect(QUESTIONS_PER_ROUND).toBe(MACHINE_QUESTIONS_PER_ROUND);
    // Sanity floor: whatever the numbers become, a zero-length countdown
    // or a zero-question round is never a legitimate configuration.
    expect(QUESTION_DURATION_MS).toBeGreaterThan(0);
    expect(QUESTIONS_PER_ROUND).toBeGreaterThan(0);
  });
});

describe('isMiroirRound', () => {
  it('is true only for the exact literal MIROIR', () => {
    expect(isMiroirRound('MIROIR')).toBe(true);
    expect(isMiroirRound('SCENARIO')).toBe(false);
    expect(isMiroirRound('FACEAFACE')).toBe(false);
    expect(isMiroirRound('miroir')).toBe(false);
    expect(isMiroirRound('')).toBe(false);
  });
});

describe('currentAnswerStep', () => {
  it('walks MIROIR from own to prediction as the first selection lands', () => {
    expect(currentAnswerStep('MIROIR', EMPTY_SELECTION)).toBe('own');
    expect(currentAnswerStep('MIROIR', selection(OWN, null))).toBe('prediction');
    expect(currentAnswerStep('MIROIR', selection(OWN, PREDICTION))).toBe('prediction');
  });

  it('never leaves the single step for SCENARIO / FACEAFACE', () => {
    expect(currentAnswerStep('SCENARIO', EMPTY_SELECTION)).toBe('single');
    expect(currentAnswerStep('SCENARIO', selection(OWN, null))).toBe('single');
    expect(currentAnswerStep('FACEAFACE', EMPTY_SELECTION)).toBe('single');
    expect(currentAnswerStep('FACEAFACE', selection(OWN, null))).toBe('single');
  });
});

describe('stepCopy', () => {
  it('labels the two MIROIR sub-steps with distinct, explicit French copy', () => {
    // Exact strings: confusing the player about WHICH of the two they are
    // answering silently corrupts the round's data, and nothing
    // server-side can detect it.
    expect(stepCopy('own').label).toBe('Étape 1 sur 2 · Ta réponse');
    expect(stepCopy('prediction').label).toBe('Étape 2 sur 2 · Ta prédiction');
    expect(stepCopy('single').label).toBe('Ta réponse');
  });

  it('gives step 2 a hint that names the partner, not the player', () => {
    expect(stepCopy('prediction').hint).toBe(
      'Devine maintenant ce que ton/ta partenaire a répondu pour lui/elle.',
    );
    expect(stepCopy('own').hint).toBe('Réponds pour toi, sincèrement.');
    expect(stepCopy('own').hint).not.toBe(stepCopy('prediction').hint);
  });
});

describe('applySelection', () => {
  it('writes the own slot on MIROIR step 1', () => {
    expect(applySelection('MIROIR', EMPTY_SELECTION, OWN)).toEqual({
      ownOptionId: OWN,
      predictionOptionId: null,
    });
  });

  it('writes the prediction slot on MIROIR step 2 without touching the own answer', () => {
    expect(applySelection('MIROIR', selection(OWN, null), PREDICTION)).toEqual({
      ownOptionId: OWN,
      predictionOptionId: PREDICTION,
    });
  });

  it('lets the same option be both the own answer and the prediction', () => {
    expect(applySelection('MIROIR', selection(OWN, null), OWN)).toEqual({
      ownOptionId: OWN,
      predictionOptionId: OWN,
    });
  });

  it('clears a stale prediction when the own answer is re-entered', () => {
    // Reached via "Modifier ma réponse", which resets to step 1: a guess
    // made against a different own answer must not survive.
    const reEntered = applySelection('MIROIR', selection(null, PREDICTION), 'opt-new-own');
    expect(reEntered).toEqual({ ownOptionId: 'opt-new-own', predictionOptionId: null });
  });

  it('writes the own slot for SCENARIO / FACEAFACE and never the prediction slot', () => {
    expect(applySelection('SCENARIO', EMPTY_SELECTION, OWN)).toEqual({
      ownOptionId: OWN,
      predictionOptionId: null,
    });
    expect(applySelection('FACEAFACE', selection(OWN, null), 'opt-other')).toEqual({
      ownOptionId: 'opt-other',
      predictionOptionId: null,
    });
  });

  it('does not mutate the selection it was given', () => {
    const before = selection(OWN, null);
    applySelection('MIROIR', before, PREDICTION);
    expect(before).toEqual({ ownOptionId: OWN, predictionOptionId: null });
  });
});

describe('selectedOptionIdForStep', () => {
  it('does not highlight the step-1 answer while the player is predicting', () => {
    expect(selectedOptionIdForStep('MIROIR', selection(OWN, null))).toBeNull();
  });

  it('highlights the prediction once made, and the own answer during step 1', () => {
    expect(selectedOptionIdForStep('MIROIR', selection(OWN, PREDICTION))).toBe(PREDICTION);
    expect(selectedOptionIdForStep('MIROIR', EMPTY_SELECTION)).toBeNull();
    expect(selectedOptionIdForStep('SCENARIO', selection(OWN, null))).toBe(OWN);
  });
});

describe('canSubmitAnswer', () => {
  it('requires BOTH MIROIR selections — one call carries both', () => {
    expect(canSubmitAnswer('MIROIR', EMPTY_SELECTION)).toBe(false);
    expect(canSubmitAnswer('MIROIR', selection(OWN, null))).toBe(false);
    expect(canSubmitAnswer('MIROIR', selection(null, PREDICTION))).toBe(false);
    expect(canSubmitAnswer('MIROIR', selection(OWN, PREDICTION))).toBe(true);
  });

  it('requires exactly the one selection for SCENARIO / FACEAFACE', () => {
    expect(canSubmitAnswer('SCENARIO', EMPTY_SELECTION)).toBe(false);
    expect(canSubmitAnswer('SCENARIO', selection(OWN, null))).toBe(true);
    expect(canSubmitAnswer('FACEAFACE', EMPTY_SELECTION)).toBe(false);
    expect(canSubmitAnswer('FACEAFACE', selection(OWN, null))).toBe(true);
  });
});

describe('buildAnswerBody', () => {
  it('builds the MIROIR body with both option ids under their exact server keys', () => {
    // `MiroirBody` in app/api/games/[id]/answers/route.ts requires exactly
    // these keys; `toEqual` on the whole object also fails if an extra or
    // renamed key creeps in.
    expect(buildAnswerBody('MIROIR', selection(OWN, PREDICTION), 1234)).toEqual({
      ownOptionId: OWN,
      predictionOptionId: PREDICTION,
      clientElapsedMs: 1234,
    });
  });

  it('does not swap the own answer and the prediction', () => {
    const body = buildAnswerBody('MIROIR', selection('a', 'b'), 0);
    expect(body).not.toBeNull();
    expect(body).toEqual({ ownOptionId: 'a', predictionOptionId: 'b', clientElapsedMs: 0 });
    // Named explicitly so an inversion cannot hide behind the object
    // comparison above being edited in tandem.
    expect(body && 'ownOptionId' in body ? body.ownOptionId : null).toBe('a');
    expect(body && 'predictionOptionId' in body ? body.predictionOptionId : null).toBe('b');
  });

  it('builds the single-option body for SCENARIO and FACEAFACE', () => {
    expect(buildAnswerBody('SCENARIO', selection(OWN, null), 500)).toEqual({
      optionId: OWN,
      clientElapsedMs: 500,
    });
    expect(buildAnswerBody('FACEAFACE', selection(OWN, null), 500)).toEqual({
      optionId: OWN,
      clientElapsedMs: 500,
    });
  });

  it('never emits the MIROIR keys for a non-MIROIR round', () => {
    const body = buildAnswerBody('SCENARIO', selection(OWN, PREDICTION), 0);
    expect(body).not.toBeNull();
    expect(body === null ? [] : Object.keys(body).sort()).toEqual(['clientElapsedMs', 'optionId']);
  });

  it('never emits the single-option key for MIROIR', () => {
    const body = buildAnswerBody('MIROIR', selection(OWN, PREDICTION), 0);
    expect(body).not.toBeNull();
    expect(body === null ? [] : Object.keys(body).sort()).toEqual([
      'clientElapsedMs',
      'ownOptionId',
      'predictionOptionId',
    ]);
  });

  it('returns null — never a partial body — while the selection is incomplete', () => {
    expect(buildAnswerBody('MIROIR', selection(OWN, null), 10)).toBeNull();
    expect(buildAnswerBody('MIROIR', selection(null, PREDICTION), 10)).toBeNull();
    expect(buildAnswerBody('MIROIR', EMPTY_SELECTION, 10)).toBeNull();
    expect(buildAnswerBody('SCENARIO', EMPTY_SELECTION, 10)).toBeNull();
  });

  it('passes clientElapsedMs through unchanged, including 0', () => {
    const late = buildAnswerBody('FACEAFACE', selection(OWN, null), 90_000);
    expect(late).toEqual({ optionId: OWN, clientElapsedMs: 90_000 });
    const instant = buildAnswerBody('FACEAFACE', selection(OWN, null), 0);
    expect(instant).toEqual({ optionId: OWN, clientElapsedMs: 0 });
  });
});

describe('jokersRemainingForRole', () => {
  it('returns the CREATOR counter for CREATOR and the PARTNER counter for PARTNER', () => {
    // Asymmetric values: equal counts would let an inverted mapping pass.
    expect(jokersRemainingForRole('CREATOR', 2, 0)).toBe(2);
    expect(jokersRemainingForRole('PARTNER', 2, 0)).toBe(0);
    expect(jokersRemainingForRole('CREATOR', 0, 3)).toBe(0);
    expect(jokersRemainingForRole('PARTNER', 0, 3)).toBe(3);
  });

  it('returns null — not a defaulted counter — for an unrecognized role', () => {
    expect(jokersRemainingForRole('', 1, 2)).toBeNull();
    expect(jokersRemainingForRole('creator', 1, 2)).toBeNull();
    expect(jokersRemainingForRole('BOTH', 1, 2)).toBeNull();
  });
});

describe('canUseJoker', () => {
  it('allows a skip only with a strictly positive, known count', () => {
    expect(canUseJoker(1)).toBe(true);
    expect(canUseJoker(3)).toBe(true);
    expect(canUseJoker(0)).toBe(false);
    expect(canUseJoker(null)).toBe(false);
  });
});

describe('nextPathAfterSubmit', () => {
  it('routes PASS_DEVICE and ROUND_REVEAL to their exact paths', () => {
    expect(nextPathAfterSubmit('sess-1', 'PASS_DEVICE')).toEqual({
      kind: 'navigate',
      path: '/jeu/sess-1/passe',
    });
    expect(nextPathAfterSubmit('sess-1', 'ROUND_REVEAL')).toEqual({
      kind: 'navigate',
      path: '/jeu/sess-1/manche-revelee',
    });
  });

  it('uses the session id it is given, so a stale route param cannot leak through', () => {
    expect(nextPathAfterSubmit('server-id', 'PASS_DEVICE')).toEqual({
      kind: 'navigate',
      path: '/jeu/server-id/passe',
    });
  });

  it('errors on an unrecognized phase instead of guessing a route', () => {
    expect(nextPathAfterSubmit('sess-1', 'SOMETHING_NEW')).toEqual({
      kind: 'error',
      message: UNKNOWN_PHASE_MESSAGE,
    });
    expect(nextPathAfterSubmit('sess-1', '')).toEqual({
      kind: 'error',
      message: UNKNOWN_PHASE_MESSAGE,
    });
  });
});

describe('interpretSkipFailure', () => {
  it('flags NO_JOKERS_LEFT and returns its French message, never the English one', () => {
    const outcome = interpretSkipFailure(
      new ApiError(403, 'No jokers remaining for the active player.', {
        error: 'NO_JOKERS_LEFT',
      }),
    );
    expect(outcome.jokersExhausted).toBe(true);
    expect(outcome.message).toBe("Vous n'avez plus de joker pour cette partie.");
  });

  it('does not flag other failures as joker exhaustion', () => {
    const outcome = interpretSkipFailure(
      new ApiError(409, "Cannot skip a question from phase 'PASS_DEVICE'.", {
        error: 'NOT_ANSWERING_PHASE',
      }),
    );
    expect(outcome.jokersExhausted).toBe(false);
    // The raw code must never reach the screen.
    expect(outcome.message).toBe("Ce n'est pas le moment de répondre.");
  });

  it('shows generic French — never English — for the transport error api() actually throws', () => {
    // `lib/api.ts` wraps EVERY non-ApiError throw into
    // `new ApiError(0, <english>)` with NO body, so `code === ''`
    // (api.ts:200-208). A bare `TypeError` therefore never reaches this
    // catch block in production; feeding one here was the misleading
    // fixture that hid an English leak. These are the real values.
    for (const english of [
      'Network error. Please try again.',
      'The request timed out. Check your connection and try again.',
      'No internet connection. Check your network and try again.',
      'The server is temporarily unavailable',
    ]) {
      const outcome = interpretSkipFailure(new ApiError(0, english));
      expect(outcome.jokersExhausted).toBe(false);
      expect(outcome.message).toBe('Une erreur est survenue.');
      expect(outcome.message).not.toBe(english);
    }
  });

  it('also handles a bare non-ApiError, keeping the function total', () => {
    const outcome = interpretSkipFailure(new TypeError('Failed to fetch'));
    expect(outcome.jokersExhausted).toBe(false);
    expect(outcome.message).toBe('Une erreur est survenue.');
  });
});

describe('bootDecisionForPhase', () => {
  it('starts the turn for the two phases start-turn accepts', () => {
    expect(bootDecisionForPhase('sess-1', 'PASS_DEVICE')).toEqual({ kind: 'start-turn' });
    // Idempotent remount mid-turn: already ANSWERING is a valid start.
    expect(bootDecisionForPhase('sess-1', 'ANSWERING')).toEqual({ kind: 'start-turn' });
  });

  it('routes ROUND_INTRO to the round intro instead of 409-ing on start-turn', () => {
    // The regression the reversed boot order fixes. `GET /current` resolves
    // ROUND_INTRO -> PASS_DEVICE and persists it, so in practice this phase
    // rarely survives the read — but `start-turn`'s guard REJECTS
    // ROUND_INTRO outright, so reaching it must never mean a dead end.
    expect(bootDecisionForPhase('sess-1', 'ROUND_INTRO')).toEqual({
      kind: 'navigate',
      path: '/jeu/sess-1/manche-intro',
    });
  });

  it('routes the other non-startable phases to the screen that owns them', () => {
    expect(bootDecisionForPhase('sess-1', 'ROUND_REVEAL')).toEqual({
      kind: 'navigate',
      path: '/jeu/sess-1/manche-revelee',
    });
    expect(bootDecisionForPhase('sess-1', 'COMPLETE')).toEqual({
      kind: 'navigate',
      path: '/jeu/sess-1/resultats',
    });
  });

  it('errors on an unrecognized phase rather than starting a turn or guessing a route', () => {
    expect(bootDecisionForPhase('sess-1', 'SOMETHING_NEW')).toEqual({
      kind: 'error',
      message: UNKNOWN_PHASE_MESSAGE,
    });
    expect(bootDecisionForPhase('sess-1', '')).toEqual({
      kind: 'error',
      message: UNKNOWN_PHASE_MESSAGE,
    });
  });

  it('builds every path from the session id it is given, never a route param', () => {
    expect(bootDecisionForPhase('server-id', 'ROUND_REVEAL')).toEqual({
      kind: 'navigate',
      path: '/jeu/server-id/manche-revelee',
    });
  });
});
