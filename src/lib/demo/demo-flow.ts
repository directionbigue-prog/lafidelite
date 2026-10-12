// Pure decision logic for `/demo` (Lot 2, Task 24) — the trial game a
// visitor with no account can play end to end.
//
// Same rationale as `lib/game/question-screen.ts`, `round-reveal.ts` and
// `resultats.ts`: this repo runs Vitest with `environment: 'node'` and ships
// neither jsdom nor Testing Library (project-owner decision), so every
// decision `components/demo/DemoGame.tsx` makes lives here as an exported
// pure function covered by exact-value unit tests, and the component stays a
// thin `useState` + render wrapper over them. (The brief named a
// `DemoGame.test.tsx`; the tests live in `demo-flow.test.ts` instead,
// against this module, because a component test would need a DOM this repo
// does not have.)
//
// Design Decision 7 — the demo drives the REAL engine, never a copy:
//   - every phase transition below goes through
//     `lib/server/game/state-machine.ts`;
//   - the score comes from `lib/server/game/scoring.ts`'s
//     `computeGameResult`;
//   - the results screen is assembled by `lib/game/resultats.ts`'s
//     `buildResultsSections`, and each round's reveal by
//     `lib/game/round-reveal.ts`'s `buildRevealRows`.
// Both server modules are free of `server-only`, Prisma and `node:` imports
// precisely so they can be pulled into this client bundle; a reimplementation
// here would be free to drift away from what the real game scores.
//
// NOTHING in this module — or anything it imports — performs I/O. There is
// no `fetch`, no `api()` wrapper, no session, no `Answer` row. A visitor with
// no cookies must be able to finish the demo, and `demo-flow.test.ts` pins
// that by driving a full run with `globalThis.fetch` replaced by a throwing
// stub.
import {
  advanceAfterAnswer,
  advanceRound,
  firstPlayerRoleForRound,
  resolvePhaseOnRead,
  startAnsweringTurn,
  type SessionPhaseState,
} from '@/lib/server/game/state-machine';
import {
  computeGameResult,
  type GameResultComputation,
  type ScoredAnswer,
} from '@/lib/server/game/scoring';
import { roundLabel, type RoundType } from '@/lib/game/round-labels';
import {
  buildRevealRows,
  revealColumnLabels,
  type ClientOption,
  type QuestionResultEntry,
  type RevealColumnLabels,
  type RevealRow,
} from '@/lib/game/round-reveal';
import type { GameResultsResponse } from '@/lib/game/resultats';
import { DEMO_CHARACTER_NAME, DEMO_QUESTIONS, type DemoQuestion } from './demo-questions';

/**
 * Player ids handed to `computeGameResult`. The visitor holds the CREATOR
 * role so `revealColumnLabels('CREATOR', …)` labels their column "Toi" — the
 * same rule the authenticated screens use, reused rather than reimplemented.
 */
export const DEMO_VISITOR_ID = 'demo-visiteur';
export const DEMO_CHARACTER_ID = 'demo-personnage';

/**
 * Cosmetic countdown length. Re-exported from `scoring.ts` rather than
 * mirrored: the demo's whole point is to run the real engine, so its ring
 * must show the real window.
 */
export { TIMER_MS as DEMO_QUESTION_DURATION_MS } from '@/lib/server/game/scoring';

/** Shown in place of the numeric scores when the demo run's gap is masked. */
export const DEMO_GAP_MASKED_MESSAGE =
  'Vos deux styles sont assez différents — c’est justement ce qui fait la conversation.';

/** French text for a phase this build does not recognize. */
export const DEMO_UNKNOWN_PHASE_MESSAGE =
  'La partie de démonstration est dans un état inconnu. Vous pouvez la relancer.';

/** One answered demo question, from the visitor's side only. */
export interface DemoVisitorAnswer {
  questionId: string;
  /** `null` when the visitor skipped. */
  ownOptionId: string | null;
  /** MIROIR only; `null` for the other rounds and for a skip. */
  predictionOptionId: string | null;
  isSkipped: boolean;
  elapsedMs: number;
}

/** Everything the demo remembers between screens. */
export interface DemoFlowState {
  /** Driven exclusively by the real state machine. */
  session: SessionPhaseState;
  /** Append-only, in play order. */
  answers: DemoVisitorAnswer[];
}

/** Which screen a `session.phase` belongs to. */
export type DemoScreen = 'intro' | 'question' | 'reveal' | 'results' | 'unknown';

/**
 * Maps the machine's phase onto the demo's screens. `PASS_DEVICE` and
 * `ANSWERING` collapse onto the same screen because the demo is played solo
 * on one phone: there is no device to hand over, so there is no
 * pass-the-device interstitial to show. An unrecognized phase yields
 * `'unknown'`, never a guessed screen — the same rule `routeForPhase`
 * applies on the authenticated side.
 */
export function demoScreenForPhase(phase: string): DemoScreen {
  switch (phase) {
    case 'ROUND_INTRO':
      return 'intro';
    case 'PASS_DEVICE':
    case 'ANSWERING':
      return 'question';
    case 'ROUND_REVEAL':
      return 'reveal';
    case 'COMPLETE':
      return 'results';
    default:
      return 'unknown';
  }
}

/**
 * The round type for a 1-indexed round number, via the shared
 * `roundLabel` table — `null` outside rounds 1-3 rather than a guess.
 */
export function demoRoundType(roundNumber: number): RoundType | null {
  return roundLabel(roundNumber)?.type ?? null;
}

/** The demo questions belonging to a round, in play order. Empty when out of range. */
export function demoQuestionsForRound(roundNumber: number): DemoQuestion[] {
  const type = demoRoundType(roundNumber);
  if (type === null) return [];
  return DEMO_QUESTIONS.filter((q) => q.roundType === type);
}

/**
 * The question the visitor is currently on, or `null` when the state is not
 * on a question screen (or points past the round's questions, which would be
 * a bug rather than something to render a blank for).
 */
export function currentDemoQuestion(state: DemoFlowState): DemoQuestion | null {
  if (demoScreenForPhase(state.session.phase) !== 'question') return null;
  const questions = demoQuestionsForRound(state.session.currentRoundNumber);
  return questions[state.session.currentQuestionNumber - 1] ?? null;
}

/** A fresh demo, parked on the round 1 intro. */
export function startDemo(): DemoFlowState {
  return {
    session: {
      currentRoundNumber: 1,
      currentQuestionNumber: 1,
      phase: 'ROUND_INTRO',
      activePlayerRole: firstPlayerRoleForRound(1),
      currentQuestionShownAt: null,
    },
    answers: [],
  };
}

/**
 * Leaves a round intro for its first question: `resolvePhaseOnRead` flips
 * `ROUND_INTRO -> PASS_DEVICE` exactly as `GET /api/games/current` does, then
 * `startAnsweringTurn` stamps the (cosmetic here) timer.
 */
export function beginDemoRound(state: DemoFlowState, now: Date): DemoFlowState {
  return {
    ...state,
    session: startAnsweringTurn(resolvePhaseOnRead(state.session), now),
  };
}

/** What the visitor picked for the question they are on. */
export interface DemoAnswerInput {
  ownOptionId: string;
  /** Required for MIROIR, ignored elsewhere. */
  predictionOptionId?: string;
  elapsedMs: number;
}

function advanceAfterDemoAnswer(state: DemoFlowState, answer: DemoVisitorAnswer, now: Date) {
  const questions = demoQuestionsForRound(state.session.currentRoundNumber);

  // Both sides of the question are known the moment the visitor submits —
  // the demo character's answer was scripted in `demo-questions.ts` — so the
  // machine is always told TWO own-answers were recorded. There is no
  // one-answer/pass-the-device hand-off in a solo demo.
  // The demo used to fake `currentQuestionNumber` up to the machine’s
  // hardcoded terminal index so a three-question round would end. The
  // machine now takes the round’s length as an argument, so the demo
  // passes its real one and stops lying about where it is.
  const { state: advanced } = advanceAfterAnswer(state.session, 2, questions.length);

  return {
    answers: [...state.answers, answer],
    // A mid-round advance lands on PASS_DEVICE; with no device to pass, the
    // demo starts the next turn immediately. A round-ending advance lands on
    // ROUND_REVEAL, which `startAnsweringTurn` must NOT touch — hence the
    // branch.
    session: advanced.phase === 'PASS_DEVICE' ? startAnsweringTurn(advanced, now) : advanced,
  };
}

/**
 * Records the visitor's answer for the current question and advances. Throws
 * (via `advanceAfterAnswer`) if called outside the ANSWERING phase — a
 * double-submit is a bug in the caller, not something to absorb silently.
 */
export function recordDemoAnswer(
  state: DemoFlowState,
  input: DemoAnswerInput,
  now: Date,
): DemoFlowState {
  const question = currentDemoQuestion(state);
  if (question === null) return state;

  return advanceAfterDemoAnswer(
    state,
    {
      questionId: question.id,
      ownOptionId: input.ownOptionId,
      predictionOptionId: input.predictionOptionId ?? null,
      isSkipped: false,
      elapsedMs: input.elapsedMs,
    },
    now,
  );
}

/**
 * Records a skipped question and advances. The demo puts no cap on skips
 * (there are no jokers to spend without an account), which keeps the
 * disclaimer's "vous pouvez passer une question quand vous voulez" true on
 * this screen too.
 */
export function skipDemoQuestion(
  state: DemoFlowState,
  elapsedMs: number,
  now: Date,
): DemoFlowState {
  const question = currentDemoQuestion(state);
  if (question === null) return state;

  return advanceAfterDemoAnswer(
    state,
    {
      questionId: question.id,
      ownOptionId: null,
      predictionOptionId: null,
      isSkipped: true,
      elapsedMs,
    },
    now,
  );
}

/** Leaves a round reveal: on to the next round's intro, or to the results. */
export function advanceDemoRound(state: DemoFlowState): DemoFlowState {
  const { state: advanced } = advanceRound(state.session);
  return { ...state, session: advanced };
}

function findDemoQuestion(questionId: string): DemoQuestion | undefined {
  return DEMO_QUESTIONS.find((q) => q.id === questionId);
}

function weightForScenarioOption(question: DemoQuestion, optionId: string): number {
  if (question.roundType !== 'SCENARIO') return 0;
  return question.options.find((o) => o.id === optionId)?.weight ?? 0;
}

/**
 * Expands the visitor's answers into the `ScoredAnswer[]` the real scoring
 * engine consumes, pairing each with the demo character's scripted side so
 * both players are always represented for every answered question.
 *
 * `optionWeight` is attached only to SCENARIO OWN answers, and only when the
 * question was not skipped — `computeFidelityScore` THROWS on a scored
 * SCENARIO answer with no weight, and `exactOptionalPropertyTypes` forbids
 * papering over that with an explicit `undefined`.
 */
export function buildDemoScoredAnswers(answers: DemoVisitorAnswer[]): ScoredAnswer[] {
  const scored: ScoredAnswer[] = [];

  for (const answer of answers) {
    const question = findDemoQuestion(answer.questionId);
    if (question === undefined) continue;
    const { roundType } = question;

    const visitorOwn: ScoredAnswer = {
      questionId: question.id,
      roundType,
      userId: DEMO_VISITOR_ID,
      kind: 'OWN',
      selectedOptionId: answer.ownOptionId,
      isSkipped: answer.isSkipped,
      effectiveElapsedMs: answer.elapsedMs,
      ...(roundType === 'SCENARIO' && !answer.isSkipped && answer.ownOptionId !== null
        ? { optionWeight: weightForScenarioOption(question, answer.ownOptionId) }
        : {}),
    };
    scored.push(visitorOwn);

    const characterOwn: ScoredAnswer = {
      questionId: question.id,
      roundType,
      userId: DEMO_CHARACTER_ID,
      kind: 'OWN',
      selectedOptionId: question.character.ownOptionId,
      isSkipped: false,
      effectiveElapsedMs: question.character.elapsedMs,
      ...(roundType === 'SCENARIO'
        ? { optionWeight: weightForScenarioOption(question, question.character.ownOptionId) }
        : {}),
    };
    scored.push(characterOwn);

    if (question.roundType === 'MIROIR') {
      scored.push({
        questionId: question.id,
        roundType,
        userId: DEMO_VISITOR_ID,
        kind: 'PREDICTION',
        selectedOptionId: answer.predictionOptionId,
        isSkipped: answer.isSkipped || answer.predictionOptionId === null,
        effectiveElapsedMs: answer.elapsedMs,
      });
      scored.push({
        questionId: question.id,
        roundType,
        userId: DEMO_CHARACTER_ID,
        kind: 'PREDICTION',
        selectedOptionId: question.character.predictionOptionId,
        isSkipped: false,
        effectiveElapsedMs: question.character.elapsedMs,
      });
    }
  }

  return scored;
}

/**
 * Runs the REAL `computeGameResult` over a finished demo run. The demo has
 * no history, so the cumulative couple score before this game is 0 — an
 * honest zero, not a flattering seed value.
 */
export function computeDemoResult(answers: DemoVisitorAnswer[]): GameResultComputation {
  return computeGameResult({
    creatorId: DEMO_VISITOR_ID,
    partnerId: DEMO_CHARACTER_ID,
    cumulativeCoupleScoreBeforeThisGame: 0,
    answers: buildDemoScoredAnswers(answers),
  });
}

/**
 * Shapes a `GameResultComputation` into the exact response `GET
 * /api/games/:id/results` would have produced, so `buildResultsSections` can
 * lay the demo's results out with the same ordered sections as the real
 * screen. Masking follows the same rule as the route: when `gapMasked`, the
 * three numeric fields are OMITTED entirely — not null, not zero — and a
 * fixed French message takes their place.
 */
export function toDemoResultsResponse(computation: GameResultComputation): GameResultsResponse {
  const base = {
    coupleScore: computation.coupleScore,
    complicityLevel: computation.complicityLevel,
    creatorTitle: computation.creatorTitle,
    partnerTitle: computation.partnerTitle,
    winnerRole: computation.winnerRole,
    conversationPrompts: computation.conversationPrompts,
  };

  if (computation.gapMasked) {
    return { ...base, maskedMessage: DEMO_GAP_MASKED_MESSAGE };
  }

  return {
    ...base,
    creatorTotalScore: computation.creatorTotalScore,
    partnerTotalScore: computation.partnerTotalScore,
    gapPercent: computation.gapPercent,
  };
}

/** "Toi" over the visitor's column, the demo character's name over the other. */
export function demoColumnLabels(): RevealColumnLabels {
  return revealColumnLabels('CREATOR', DEMO_CHARACTER_NAME);
}

function toClientOptions(question: DemoQuestion): ClientOption[] {
  // Deliberately drops SCENARIO's `weight`: the reveal screen must never see
  // it (same product rule as the authenticated reveal route, which never
  // sends it).
  return question.options.map((o) => ({ id: o.id, text: o.text }));
}

/**
 * Builds the reveal payload for one finished round in the exact shape
 * `GET /api/games/:id/rounds/:roundNumber` returns, so the demo's reveal goes
 * through the same `buildRevealRows` — including its diagonal MIROIR
 * comparison, which is far too easy to get backwards by hand.
 *
 * `creatorPrediction` / `partnerPrediction` are present ONLY for MIROIR, by
 * key presence, exactly as the route shapes them.
 */
export function buildDemoRevealEntries(
  roundNumber: number,
  answers: DemoVisitorAnswer[],
): QuestionResultEntry[] {
  const entries: QuestionResultEntry[] = [];

  for (const question of demoQuestionsForRound(roundNumber)) {
    const answer = answers.find((a) => a.questionId === question.id);
    if (answer === undefined) continue;

    const base: QuestionResultEntry = {
      id: question.id,
      prompt: question.prompt,
      options: toClientOptions(question),
      creatorAnswer: {
        selectedOptionId: answer.ownOptionId,
        isSkipped: answer.isSkipped,
      },
      partnerAnswer: {
        selectedOptionId: question.character.ownOptionId,
        isSkipped: false,
      },
    };

    if (question.roundType === 'MIROIR') {
      entries.push({
        ...base,
        creatorPrediction: {
          selectedOptionId: answer.predictionOptionId,
          isSkipped: answer.isSkipped || answer.predictionOptionId === null,
        },
        partnerPrediction: {
          selectedOptionId: question.character.predictionOptionId,
          isSkipped: false,
        },
      });
      continue;
    }

    entries.push(base);
  }

  return entries;
}

/** The reveal rows for one finished demo round, ready to render. */
export function buildDemoRevealRows(
  roundNumber: number,
  answers: DemoVisitorAnswer[],
): RevealRow[] {
  // The demo's rounds are the real ones, so the alignment verdict is
  // computed with the same round type the live game would pass. An unknown
  // round number reaches here only if `demoRoundType` already returned
  // null upstream, in which case there are no entries to build.
  return buildRevealRows(
    buildDemoRevealEntries(roundNumber, answers),
    demoRoundType(roundNumber) ?? '',
  );
}
