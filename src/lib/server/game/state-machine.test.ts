import { describe, it, expect } from 'vitest';
import {
  firstPlayerRoleForRound,
  startAnsweringTurn,
  advanceAfterAnswer,
  advanceRound,
  QUESTIONS_PER_ROUND,
  resolvePhaseOnRead,
  type SessionPhaseState,
} from './state-machine';

function baseState(overrides: Partial<SessionPhaseState> = {}): SessionPhaseState {
  return {
    currentRoundNumber: 1,
    currentQuestionNumber: 1,
    phase: 'PASS_DEVICE',
    activePlayerRole: 'CREATOR',
    currentQuestionShownAt: null,
    ...overrides,
  };
}

describe('firstPlayerRoleForRound', () => {
  it('round 1 -> CREATOR', () => {
    expect(firstPlayerRoleForRound(1)).toBe('CREATOR');
  });

  it('round 2 -> PARTNER', () => {
    expect(firstPlayerRoleForRound(2)).toBe('PARTNER');
  });

  it('round 3 -> CREATOR', () => {
    expect(firstPlayerRoleForRound(3)).toBe('CREATOR');
  });
});

describe('startAnsweringTurn', () => {
  it('stamps currentQuestionShownAt = now when it is null, and flips phase to ANSWERING', () => {
    const now = new Date('2026-09-03T10:00:00.000Z');
    const state = baseState({ phase: 'PASS_DEVICE', currentQuestionShownAt: null });

    const result = startAnsweringTurn(state, now);

    expect(result).toEqual({
      ...state,
      phase: 'ANSWERING',
      currentQuestionShownAt: now,
    });
  });

  it('leaves an existing non-null stamp untouched on a second call (idempotent)', () => {
    const firstNow = new Date('2026-09-03T10:00:00.000Z');
    const secondNow = new Date('2026-09-03T10:00:05.000Z');
    const state = baseState({ phase: 'ANSWERING', currentQuestionShownAt: firstNow });

    const result = startAnsweringTurn(state, secondNow);

    expect(result.currentQuestionShownAt).toEqual(firstNow);
    expect(result.phase).toBe('ANSWERING');
  });
});

describe('advanceAfterAnswer', () => {
  it('with 1: toggles CREATOR -> PARTNER, phase = PASS_DEVICE, clears timestamp, question number unchanged, roundCompleted false', () => {
    const state = baseState({
      currentRoundNumber: 1,
      currentQuestionNumber: 3,
      phase: 'ANSWERING',
      activePlayerRole: 'CREATOR',
      currentQuestionShownAt: new Date('2026-09-03T10:00:00.000Z'),
    });

    const result = advanceAfterAnswer(state, 1, QUESTIONS_PER_ROUND);

    expect(result).toEqual({
      state: {
        currentRoundNumber: 1,
        currentQuestionNumber: 3,
        phase: 'PASS_DEVICE',
        activePlayerRole: 'PARTNER',
        currentQuestionShownAt: null,
      },
      roundCompleted: false,
    });
  });

  it('with 1: toggles PARTNER -> CREATOR', () => {
    const state = baseState({
      currentRoundNumber: 2,
      currentQuestionNumber: 2,
      phase: 'ANSWERING',
      activePlayerRole: 'PARTNER',
      currentQuestionShownAt: new Date('2026-09-03T10:00:00.000Z'),
    });

    const result = advanceAfterAnswer(state, 1, QUESTIONS_PER_ROUND);

    expect(result.state.activePlayerRole).toBe('CREATOR');
    expect(result.state.phase).toBe('PASS_DEVICE');
    expect(result.state.currentQuestionShownAt).toBeNull();
    expect(result.state.currentQuestionNumber).toBe(2);
    expect(result.roundCompleted).toBe(false);
  });

  it('with 2 and currentQuestionNumber < 5, round 1: increments question number, resets activePlayerRole to CREATOR (round 1 starter)', () => {
    const state = baseState({
      currentRoundNumber: 1,
      currentQuestionNumber: 2,
      phase: 'ANSWERING',
      activePlayerRole: 'PARTNER',
      currentQuestionShownAt: new Date('2026-09-03T10:00:00.000Z'),
    });

    const result = advanceAfterAnswer(state, 2, QUESTIONS_PER_ROUND);

    expect(result).toEqual({
      state: {
        currentRoundNumber: 1,
        currentQuestionNumber: 3,
        phase: 'PASS_DEVICE',
        activePlayerRole: 'CREATOR',
        currentQuestionShownAt: null,
      },
      roundCompleted: false,
    });
  });

  it('with 2 and currentQuestionNumber < 5, round 2: increments question number, resets activePlayerRole to PARTNER (round 2 starter)', () => {
    const state = baseState({
      currentRoundNumber: 2,
      currentQuestionNumber: 1,
      phase: 'ANSWERING',
      activePlayerRole: 'CREATOR',
      currentQuestionShownAt: new Date('2026-09-03T10:00:00.000Z'),
    });

    const result = advanceAfterAnswer(state, 2, QUESTIONS_PER_ROUND);

    expect(result).toEqual({
      state: {
        currentRoundNumber: 2,
        currentQuestionNumber: 2,
        phase: 'PASS_DEVICE',
        activePlayerRole: 'PARTNER',
        currentQuestionShownAt: null,
      },
      roundCompleted: false,
    });
  });

  it('with 2 and currentQuestionNumber === 5: phase = ROUND_REVEAL, roundCompleted true, round/question numbers left as-is', () => {
    const state = baseState({
      currentRoundNumber: 1,
      currentQuestionNumber: 5,
      phase: 'ANSWERING',
      activePlayerRole: 'PARTNER',
      currentQuestionShownAt: new Date('2026-09-03T10:00:00.000Z'),
    });

    const result = advanceAfterAnswer(state, 2, QUESTIONS_PER_ROUND);

    expect(result).toEqual({
      state: {
        currentRoundNumber: 1,
        currentQuestionNumber: 5,
        phase: 'ROUND_REVEAL',
        activePlayerRole: 'PARTNER',
        currentQuestionShownAt: null,
      },
      roundCompleted: true,
    });
  });

  it('throws when ownAnswersRecordedForCurrentQuestion is outside {1,2}', () => {
    // phase must be ANSWERING here so this actually exercises the
    // count-argument guard, not the phase-precondition guard below.
    const state = baseState({ phase: 'ANSWERING' });
    expect(() => advanceAfterAnswer(state, 3 as unknown as 1 | 2, QUESTIONS_PER_ROUND)).toThrow();
  });

  it('throws when called from a non-ANSWERING phase (Fix 3, final whole-branch review — guards against a duplicate/replayed answer submission corrupting whose turn it is)', () => {
    const state = baseState({ phase: 'PASS_DEVICE' });
    expect(() => advanceAfterAnswer(state, 1, QUESTIONS_PER_ROUND)).toThrow(
      "advanceAfterAnswer: expected phase 'ANSWERING', got 'PASS_DEVICE'",
    );
  });
});

describe('advanceRound', () => {
  it('from round 1: currentRoundNumber = 2, currentQuestionNumber = 1, phase = ROUND_INTRO, activePlayerRole = PARTNER, gameCompleted false', () => {
    const state = baseState({
      currentRoundNumber: 1,
      currentQuestionNumber: 5,
      phase: 'ROUND_REVEAL',
      activePlayerRole: 'PARTNER',
      currentQuestionShownAt: null,
    });

    const result = advanceRound(state);

    expect(result).toEqual({
      state: {
        currentRoundNumber: 2,
        currentQuestionNumber: 1,
        phase: 'ROUND_INTRO',
        activePlayerRole: 'PARTNER',
        currentQuestionShownAt: null,
      },
      gameCompleted: false,
    });
  });

  it('from round 2: currentRoundNumber = 3, phase = ROUND_INTRO, activePlayerRole = CREATOR, gameCompleted false', () => {
    const state = baseState({
      currentRoundNumber: 2,
      currentQuestionNumber: 5,
      phase: 'ROUND_REVEAL',
      activePlayerRole: 'CREATOR',
      currentQuestionShownAt: null,
    });

    const result = advanceRound(state);

    expect(result).toEqual({
      state: {
        currentRoundNumber: 3,
        currentQuestionNumber: 1,
        phase: 'ROUND_INTRO',
        activePlayerRole: 'CREATOR',
        currentQuestionShownAt: null,
      },
      gameCompleted: false,
    });
  });

  it('from round 3: phase = COMPLETE, gameCompleted true', () => {
    const state = baseState({
      currentRoundNumber: 3,
      currentQuestionNumber: 5,
      phase: 'ROUND_REVEAL',
      activePlayerRole: 'CREATOR',
      currentQuestionShownAt: null,
    });

    const result = advanceRound(state);

    expect(result).toEqual({
      state: {
        currentRoundNumber: 3,
        currentQuestionNumber: 5,
        phase: 'COMPLETE',
        activePlayerRole: 'CREATOR',
        currentQuestionShownAt: null,
      },
      gameCompleted: true,
    });
  });

  it('throws when phase !== ROUND_REVEAL', () => {
    const state = baseState({ phase: 'PASS_DEVICE' });
    expect(() => advanceRound(state)).toThrow();
  });
});

describe('resolvePhaseOnRead', () => {
  it('flips ROUND_INTRO -> PASS_DEVICE', () => {
    const state = baseState({ phase: 'ROUND_INTRO' });

    const result = resolvePhaseOnRead(state);

    expect(result).toEqual({ ...state, phase: 'PASS_DEVICE' });
  });

  it.each(['PASS_DEVICE', 'ANSWERING', 'ROUND_REVEAL', 'COMPLETE'])(
    'returns %s unchanged (same shape, same values)',
    (phase) => {
      const state = baseState({ phase });

      const result = resolvePhaseOnRead(state);

      expect(result).toEqual(state);
    },
  );
});

describe('advanceAfterAnswer with a format-dependent round length', () => {
  // Express deals 2 / 2 / 1, so "the round is over" is no longer a fixed
  // number. These pin that the machine reads the length it is given and
  // nothing else — the whole reason the parameter exists.
  function answering(questionNumber: number): SessionPhaseState {
    return {
      currentRoundNumber: 1,
      currentQuestionNumber: questionNumber,
      phase: 'ANSWERING',
      activePlayerRole: 'CREATOR',
      currentQuestionShownAt: new Date('2026-09-06T20:00:00.000Z'),
    };
  }

  it('ends a two-question round at question 2, not at 5', () => {
    const result = advanceAfterAnswer(answering(2), 2, 2);
    expect(result.state.phase).toBe('ROUND_REVEAL');
    expect(result.roundCompleted).toBe(true);
  });

  it('does not end that round early at question 1', () => {
    const result = advanceAfterAnswer(answering(1), 2, 2);
    expect(result.state.phase).toBe('PASS_DEVICE');
    expect(result.state.currentQuestionNumber).toBe(2);
    expect(result.roundCompleted).toBe(false);
  });

  it('ends a one-question round immediately — the last manche of Express', () => {
    const result = advanceAfterAnswer(answering(1), 2, 1);
    expect(result.state.phase).toBe('ROUND_REVEAL');
    expect(result.roundCompleted).toBe(true);
  });

  it('keeps going through a ten-question round — Longue soirée', () => {
    const result = advanceAfterAnswer(answering(5), 2, 10);
    expect(result.state.phase).toBe('PASS_DEVICE');
    expect(result.state.currentQuestionNumber).toBe(6);
    expect(result.roundCompleted).toBe(false);
  });

  it('still hands the device over on a single own-answer, whatever the length', () => {
    for (const length of [1, 2, 5, 10]) {
      const result = advanceAfterAnswer(answering(1), 1, length);
      expect(result.state.phase, `length=${length}`).toBe('PASS_DEVICE');
      expect(result.state.activePlayerRole).toBe('PARTNER');
      expect(result.roundCompleted).toBe(false);
    }
  });
});
