// Pure decision logic for `/jeu/[id]/question` (Lot 2, Task 20) — the
// screen where a player actually answers.
//
// Same rationale as `phase-routes.ts`, `start-screen.ts` and `Timer.tsx`:
// this repo runs Vitest with `environment: 'node'` and ships neither jsdom
// nor Testing Library, so every decision the page makes lives here as an
// exported pure function covered by exact-value unit tests, and the page
// component stays a thin fetch + render wrapper.
//
// Four decisions are extracted, in rough order of blast radius:
//   1. `buildAnswerBody` — the MIROIR-vs-single-option request shape. The
//      two shapes are Zod-validated server-side against the CURRENT round's
//      type (see `app/api/games/[id]/answers/route.ts`), so sending the
//      wrong one is either a 400 or — worse, if the two ever converged — a
//      silently mis-recorded answer.
//   2. `canSubmitAnswer` — MIROIR collects BOTH selections client-side and
//      submits them in ONE call; submitting after only the first would
//      record a prediction the player never made.
//   3. `jokersRemainingForRole` — which of the session's two counters
//      belongs to the player currently holding the phone. Inverting this is
//      invisible while testing alone on one device.
//   4. `nextPathAfterSubmit` — where the server's response `phase` sends
//      the player next, delegating to `routeForPhase` so an unrecognized
//      phase surfaces as an error instead of a guessed route.
import { routeForPhase } from './phase-routes';
import { toGameApiFailure } from './api-result';

/**
 * Cosmetic countdown length for one question, mirroring `TIMER_MS` in
 * `lib/server/game/scoring.ts`.
 *
 * Re-exported rather than restated. It was originally duplicated on the
 * argument that this module should stay a pure client-side concern — but
 * `scoring.ts` became bundle-safe once its randomness moved from
 * `node:crypto` to `globalThis.crypto` (so `/demo` could run the real
 * engine in the browser), which removed the only reason for the copy and
 * left a bare literal that a drift would silently desynchronise from the
 * window the server actually scores against.
 *
 * The server remains the sole authority on elapsed time
 * (`computeEffectiveElapsedMs`), so a drift here would only ever have
 * mislead the player's ring — but showing someone a countdown that does
 * not match the window they are being scored on is its own defect.
 */
export { TIMER_MS as QUESTION_DURATION_MS } from '@/lib/server/game/scoring';

/**
 * Questions per round, for the "Question 3 sur 5" caption.
 *
 * Re-exported from the state machine rather than restated: that module
 * owns the "is the round over?" decision, and this caption must never be
 * able to disagree with it. (`state-machine.ts` carries no `server-only`
 * or Prisma import, so importing it from client code is safe — the same
 * property `/demo` relies on, and which `demo-flow.test.ts` now guards.)
 */
export { QUESTIONS_PER_ROUND } from '@/lib/server/game/state-machine';

/** French text for a `phase` this frontend build does not recognize. */
export const UNKNOWN_PHASE_MESSAGE =
  'Cette partie est dans un état inconnu. Revenez à l’accueil du jeu.';

/**
 * What the player has picked so far. For SCENARIO / FACEAFACE only
 * `ownOptionId` is ever used; MIROIR fills both before a single submit.
 */
export interface AnswerSelection {
  ownOptionId: string | null;
  predictionOptionId: string | null;
}

export const EMPTY_SELECTION: AnswerSelection = { ownOptionId: null, predictionOptionId: null };

/** The exact JSON bodies `POST /api/games/:id/answers` accepts. */
export type AnswerRequestBody =
  | { ownOptionId: string; predictionOptionId: string; clientElapsedMs: number }
  | { optionId: string; clientElapsedMs: number };

/**
 * `roundType` arrives from the API as an unnarrowed string. Only the exact
 * literal `'MIROIR'` takes the two-selection path — an unknown or
 * mis-cased value falls back to the single-option shape, which is what
 * SCENARIO and FACEAFACE both use.
 */
export function isMiroirRound(roundType: string): boolean {
  return roundType === 'MIROIR';
}

/**
 * Which of the two MIROIR sub-steps the player is on, derived from the
 * selection rather than kept as separate state (two sources of truth for
 * "which question am I answering" is exactly how a prediction gets written
 * into the own-answer slot).
 *
 * `'single'` means the round is not MIROIR and there is only one choice to
 * make.
 */
export type AnswerStep = 'own' | 'prediction' | 'single';

export function currentAnswerStep(roundType: string, selection: AnswerSelection): AnswerStep {
  if (!isMiroirRound(roundType)) return 'single';
  return selection.ownOptionId === null ? 'own' : 'prediction';
}

export interface StepCopy {
  /** Short label above the options, e.g. "Ta réponse". */
  label: string;
  /** One line telling the player what they are choosing right now. */
  hint: string;
}

const STEP_COPY: Record<AnswerStep, StepCopy> = {
  own: {
    label: 'Étape 1 sur 2 · Ta réponse',
    hint: 'Réponds pour toi, sincèrement.',
  },
  prediction: {
    label: 'Étape 2 sur 2 · Ta prédiction',
    hint: 'Devine maintenant ce que ton/ta partenaire a répondu pour lui/elle.',
  },
  single: {
    label: 'Ta réponse',
    hint: 'Réponds pour toi, sincèrement.',
  },
};

/**
 * The heading + hint for a step. Exported and table-driven so the
 * distinction between the two MIROIR sub-steps is asserted on exact
 * strings: a player who thinks they are predicting while actually
 * recording their own answer corrupts the round's data, and no server-side
 * validation can detect that.
 */
export function stepCopy(step: AnswerStep): StepCopy {
  return STEP_COPY[step];
}

/**
 * Records an option tap into the selection, routed by the current step.
 * Returns a NEW object (never mutates) so React state updates stay honest.
 */
export function applySelection(
  roundType: string,
  selection: AnswerSelection,
  optionId: string,
): AnswerSelection {
  if (currentAnswerStep(roundType, selection) === 'prediction') {
    return { ownOptionId: selection.ownOptionId, predictionOptionId: optionId };
  }
  // Both `'own'` (MIROIR step 1) and `'single'` write the own-answer slot.
  // Re-entering step 1 (via "Modifier ma réponse") clears any stale
  // prediction rather than keeping a guess made against a different answer.
  return { ownOptionId: optionId, predictionOptionId: null };
}

/**
 * The option id that should currently render as selected — the
 * step's own slot, not "whatever was last tapped". During MIROIR step 2 the
 * step-1 choice must NOT appear highlighted, or the player reads their own
 * answer as their prediction.
 */
export function selectedOptionIdForStep(
  roundType: string,
  selection: AnswerSelection,
): string | null {
  return currentAnswerStep(roundType, selection) === 'prediction'
    ? selection.predictionOptionId
    : selection.ownOptionId;
}

/**
 * Whether the submit control may fire yet. MIROIR needs BOTH selections
 * because the two are sent in a single `POST /answers` call; the other two
 * round types need only the one.
 */
export function canSubmitAnswer(roundType: string, selection: AnswerSelection): boolean {
  if (isMiroirRound(roundType)) {
    return selection.ownOptionId !== null && selection.predictionOptionId !== null;
  }
  return selection.ownOptionId !== null;
}

/**
 * Builds the exact `POST /api/games/:id/answers` body for the round type,
 * or `null` when the selection is not complete yet (which the caller must
 * treat as "do not submit", never as "submit an empty body").
 *
 * The MIROIR body carries `ownOptionId` + `predictionOptionId`; SCENARIO
 * and FACEAFACE carry a single `optionId`. These key names are what the
 * server's two Zod schemas require — see `MiroirBody` / `SingleOptionBody`
 * in `app/api/games/[id]/answers/route.ts`.
 */
export function buildAnswerBody(
  roundType: string,
  selection: AnswerSelection,
  clientElapsedMs: number,
): AnswerRequestBody | null {
  if (!canSubmitAnswer(roundType, selection)) return null;

  if (isMiroirRound(roundType)) {
    // Non-null by `canSubmitAnswer` above; narrowed explicitly because
    // TypeScript cannot see through the helper.
    const { ownOptionId, predictionOptionId } = selection;
    if (ownOptionId === null || predictionOptionId === null) return null;
    return { ownOptionId, predictionOptionId, clientElapsedMs };
  }

  const { ownOptionId } = selection;
  if (ownOptionId === null) return null;
  return { optionId: ownOptionId, clientElapsedMs };
}

/**
 * Picks the joker counter belonging to the role whose turn it is.
 * `POST /start-turn` returns `activePlayerRole` but no counts;
 * `GET /api/games/current` returns both counts but is a separate call, so
 * the pairing happens here.
 *
 * Returns `null` for a role string this build does not recognize — the
 * page shows "—" rather than silently displaying the OTHER player's
 * jokers, which would let someone burn a joker they do not have (or
 * believe they have none when they do).
 */
export function jokersRemainingForRole(
  activePlayerRole: string,
  jokersRemainingCreator: number,
  jokersRemainingPartner: number,
): number | null {
  if (activePlayerRole === 'CREATOR') return jokersRemainingCreator;
  if (activePlayerRole === 'PARTNER') return jokersRemainingPartner;
  return null;
}

/** Whether the "Passer" control may be pressed for a given joker count. */
export function canUseJoker(jokersRemaining: number | null): boolean {
  return jokersRemaining !== null && jokersRemaining > 0;
}

export type SubmitOutcome = { kind: 'navigate'; path: string } | { kind: 'error'; message: string };

/**
 * Where a successful `POST /answers` or `POST /skip` sends the player, from
 * the `phase` in its response.
 *
 * `sessionId` MUST be the id the SERVER returned (from
 * `GET /api/games/current`), never the `[id]` route param: a stale tab must
 * not carry a finished game's id into the next screen. An unrecognized
 * phase yields an error, never a guessed route — see `routeForPhase`.
 */
export function nextPathAfterSubmit(sessionId: string, phase: string): SubmitOutcome {
  const path = routeForPhase(sessionId, phase);
  if (path === null) return { kind: 'error', message: UNKNOWN_PHASE_MESSAGE };
  return { kind: 'navigate', path };
}

/**
 * The phases `POST /api/games/:id/start-turn` accepts — mirrors
 * `STARTABLE_PHASES` in `app/api/games/[id]/start-turn/route.ts`. Every
 * other phase is a 409 `INVALID_PHASE`.
 */
const STARTABLE_PHASES: ReadonlySet<string> = new Set(['PASS_DEVICE', 'ANSWERING']);

export type BootDecision =
  | { kind: 'start-turn' }
  | { kind: 'navigate'; path: string }
  | { kind: 'error'; message: string };

/**
 * What to do on mount, given the authoritative phase from
 * `GET /api/games/current`.
 *
 * The page reads `/current` FIRST and only then POSTs `start-turn` — the
 * reverse of the order this task was originally briefed with. The read
 * takes no id (it resolves the couple's IN_PROGRESS session by
 * `coupleId`), so its `id` is authoritative and the `[id]` route param is
 * never trusted, matching `passe/page.tsx`, which reads no param at all.
 *
 * Reading first also removes a real dead end rather than adding one:
 * `/current` lazily resolves `ROUND_INTRO -> PASS_DEVICE` and persists it
 * (`resolvePhaseOnRead`), while `start-turn`'s guard REJECTS
 * `ROUND_INTRO`. Under the old order a perfectly healthy session parked in
 * `ROUND_INTRO` — a stale tab, a deep link, a back-button from
 * `/manche-intro` — 409'd onto the error screen. Here it arrives already
 * resolved to `PASS_DEVICE` and simply starts.
 *
 * Any phase `start-turn` would refuse is routed to the screen that owns it
 * instead of eating the 409 — free, because the phase is already in hand.
 * An unrecognized phase is an error, never a guessed route.
 */
export function bootDecisionForPhase(sessionId: string, phase: string): BootDecision {
  if (STARTABLE_PHASES.has(phase)) return { kind: 'start-turn' };
  const path = routeForPhase(sessionId, phase);
  if (path === null) return { kind: 'error', message: UNKNOWN_PHASE_MESSAGE };
  return { kind: 'navigate', path };
}

export interface SkipFailureOutcome {
  /**
   * True only for `NO_JOKERS_LEFT` (403): the Passer control must be
   * disabled and the call must NOT be retried — retrying can only 403
   * again.
   */
  jokersExhausted: boolean;
  /** Already-French, ready to render. Never a raw `ApiError.message`. */
  message: string;
}

/**
 * Interprets a rejected `POST /api/games/:id/skip`. Goes through
 * `toGameApiFailure` so the message is translated at the boundary — the
 * raw `ApiError.message` for this endpoint is the English
 * `'No jokers remaining for the active player.'`, and `lib/api.ts` fills
 * `.message` from the body's `error` for codes that carry no message at
 * all, which is how stable codes like `NOT_ANSWERING_PHASE` ended up on
 * screen on an earlier page.
 *
 * A transport failure arrives here as `api()`'s code-less
 * `ApiError(0, 'Network error. Please try again.')`, NOT as a bare
 * `TypeError` — `toGameApiFailure` maps that empty code to the generic
 * French message rather than to the English transport text.
 */
export function interpretSkipFailure(err: unknown): SkipFailureOutcome {
  const failure = toGameApiFailure(err);
  if (failure.ok) {
    // Unreachable for a caught error; `toGameApiFailure` only ever builds
    // the failure branch. Kept as a total function rather than a cast.
    return { jokersExhausted: false, message: UNKNOWN_PHASE_MESSAGE };
  }
  return { jokersExhausted: failure.code === 'NO_JOKERS_LEFT', message: failure.message };
}
