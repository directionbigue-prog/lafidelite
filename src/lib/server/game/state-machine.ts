// Pure phase-transition state machine for a game session's turn/round/phase
// bookkeeping. No Prisma import, no `server-only` import — this module must
// stay testable without a database. Inputs/outputs are plain objects that
// mirror the relevant GameSession/GameRound columns (Task 1), never the
// Prisma model type directly.
//
// Consumed by Lot 2's `/api/games/*` routes, which own persistence; this
// module only computes the next in-memory phase state and throws on
// misuse rather than silently no-op-ing (a caller hitting a throw here is a
// Lot 2 routing bug that should fail loudly in tests).

/**
 * Questions in one round. THE authoritative copy — this module owns the
 * "is the round over?" decision, so every other place that needs the
 * number must import it from here rather than restate it.
 *
 * It used to be a bare `5` inline below, which meant nothing *could*
 * import it and three unlinked copies drifted apart across the client,
 * the demo and this file. Growing a round to six questions would have
 * left the demo stranded on a blank screen with every test still green.
 */
export const QUESTIONS_PER_ROUND = 5;

/**
 * How many questions the CURRENT round holds.
 *
 * Now that a game has a format (Express / Standard / Longue soirée), the
 * round length is a property of the session, not of the codebase, and
 * rounds within one game can differ — Express is 2 / 2 / 1. Callers pass
 * it in.
 *
 * `QUESTIONS_PER_ROUND` remains as the Standard-format length and as the
 * default a caller may choose to use; it is no longer read by the machine
 * itself, because a constant cannot answer a per-round question.
 */

/**
 * Rounds in one game (MIROIR, SCENARIO, FACEAFACE). Authoritative for the
 * same reason as `QUESTIONS_PER_ROUND`: this module decides when the last
 * round ends, so callers that need to bound a round number — a route
 * validating a URL segment, a screen rendering "Manche 2 sur 3" — import
 * it rather than restating 3.
 */
export const TOTAL_ROUNDS = 3;

export interface SessionPhaseState {
  currentRoundNumber: number; // 1-3
  currentQuestionNumber: number; // 1-5
  phase: string; // PASS_DEVICE | ANSWERING | ROUND_REVEAL | ROUND_INTRO | COMPLETE
  activePlayerRole: string; // CREATOR | PARTNER
  currentQuestionShownAt: Date | null;
}

/**
 * CREATOR starts round 1, PARTNER starts round 2, CREATOR starts round 3.
 * Both players always start every question of a round from this same
 * configured starter (see GameRound.firstPlayerRole doc comment, Task 1).
 */
export function firstPlayerRoleForRound(roundNumber: number): 'CREATOR' | 'PARTNER' {
  return roundNumber % 2 === 0 ? 'PARTNER' : 'CREATOR';
}

/**
 * PASS_DEVICE -> ANSWERING. Stamps currentQuestionShownAt = now IF it is
 * currently null (idempotent — a second call while already ANSWERING must
 * not overwrite the stamp, since that would corrupt the speed-bonus timer
 * for a client that re-fetches state mid-turn).
 */
export function startAnsweringTurn(state: SessionPhaseState, now: Date): SessionPhaseState {
  return {
    ...state,
    phase: 'ANSWERING',
    currentQuestionShownAt: state.currentQuestionShownAt ?? now,
  };
}

export interface AdvanceAfterAnswerResult {
  state: SessionPhaseState;
  roundCompleted: boolean; // true when this was the 5th question's 2nd answer
}

/**
 * Only valid when state.phase === 'ANSWERING'. This state machine is the
 * sole turn-order authority (see the GameSession doc comment in
 * schema.prisma — the server trusts activePlayerRole, not a second auth
 * boundary), so a duplicate/replayed answer submission that re-invokes
 * this function from a non-ANSWERING phase (e.g. PASS_DEVICE) must fail
 * loudly rather than silently corrupt whose turn it is.
 */
export function advanceAfterAnswer(
  state: SessionPhaseState,
  ownAnswersRecordedForCurrentQuestion: 1 | 2,
  questionsInRound: number,
): AdvanceAfterAnswerResult {
  if (state.phase !== 'ANSWERING') {
    throw new Error(`advanceAfterAnswer: expected phase 'ANSWERING', got '${state.phase}'`);
  }

  if (ownAnswersRecordedForCurrentQuestion === 1) {
    return {
      state: {
        ...state,
        activePlayerRole: state.activePlayerRole === 'CREATOR' ? 'PARTNER' : 'CREATOR',
        phase: 'PASS_DEVICE',
        currentQuestionShownAt: null,
      },
      roundCompleted: false,
    };
  }

  if (ownAnswersRecordedForCurrentQuestion === 2) {
    if (state.currentQuestionNumber < questionsInRound) {
      return {
        state: {
          ...state,
          currentQuestionNumber: state.currentQuestionNumber + 1,
          activePlayerRole: firstPlayerRoleForRound(state.currentRoundNumber),
          phase: 'PASS_DEVICE',
          currentQuestionShownAt: null,
        },
        roundCompleted: false,
      };
    }

    // The round’s last question — whichever number that is for this format.
    return {
      state: {
        ...state,
        phase: 'ROUND_REVEAL',
        currentQuestionShownAt: null,
      },
      roundCompleted: true,
    };
  }

  throw new Error(
    `advanceAfterAnswer: ownAnswersRecordedForCurrentQuestion must be 1 or 2, got ${String(
      ownAnswersRecordedForCurrentQuestion,
    )}`,
  );
}

export interface AdvanceRoundResult {
  state: SessionPhaseState;
  gameCompleted: boolean;
}

/**
 * Only valid when state.phase === 'ROUND_REVEAL'.
 */
export function advanceRound(state: SessionPhaseState): AdvanceRoundResult {
  if (state.phase !== 'ROUND_REVEAL') {
    throw new Error(`advanceRound: expected phase 'ROUND_REVEAL', got '${state.phase}'`);
  }

  if (state.currentRoundNumber < TOTAL_ROUNDS) {
    const nextRound = state.currentRoundNumber + 1;
    return {
      state: {
        ...state,
        currentRoundNumber: nextRound,
        currentQuestionNumber: 1,
        phase: 'ROUND_INTRO',
        activePlayerRole: firstPlayerRoleForRound(nextRound),
      },
      gameCompleted: false,
    };
  }

  // currentRoundNumber === 3
  return {
    state: {
      ...state,
      phase: 'COMPLETE',
    },
    gameCompleted: true,
  };
}

/**
 * Lazily flips ROUND_INTRO -> PASS_DEVICE the first time state is read
 * after advanceRound moved a session there — mirrors the lazy
 * currentQuestionShownAt stamping in startAnsweringTurn. Every other phase
 * passes through unchanged.
 */
export function resolvePhaseOnRead(state: SessionPhaseState): SessionPhaseState {
  if (state.phase === 'ROUND_INTRO') {
    return { ...state, phase: 'PASS_DEVICE' };
  }
  return state;
}
