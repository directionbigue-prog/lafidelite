// Pure decision logic for `/jeu/[id]/manche-revelee` (Lot 2, Task 21) — the
// between-rounds reveal both partners read together after a round
// completes.
//
// Same rationale as `phase-routes.ts`, `start-screen.ts` and
// `question-screen.ts`: this repo runs Vitest with `environment: 'node'`
// and ships neither jsdom nor Testing Library (project-owner decision), so
// every decision the page makes lives here as an exported pure function
// covered by exact-value unit tests, and the page component stays a thin
// fetch + render wrapper.
//
// THE defect this module exists to make impossible: for a MIROIR round,
// each partner's PREDICTION must be judged against the OTHER partner's
// ACTUAL answer — a diagonal comparison — never against the predictor's
// own answer. `isPredictionMatch` takes exactly two `AnswerShape` values
// with no notion of "self" or "other" baked in, so the diagonal wiring
// lives in exactly ONE place below (`buildRevealRow`), not re-derived by
// every caller (including the page component, which never sees raw
// predictions/answers paired up itself — it only ever gets the already-
// wired `RevealRow.mirror.creatorGuessedRight` /
// `partnerGuessedRight`). See `round-reveal.test.ts` for the mutation
// check and the fixture that makes a swapped comparison fail loudly
// instead of silently passing.
//
// Hard product constraint (PRD "no archive of fidelity weight"): nothing
// exported here ever computes or exposes a score, a point count, a
// percentage, or the raw `weight` field — `weight` never even reaches this
// module, because `GET /api/games/:id/rounds/:roundNumber` never sends it
// (see that route's doc comment). Only text + a boolean "guessed right"
// flag are produced.
import { routeForPhase } from './phase-routes';
import { UNKNOWN_PHASE_MESSAGE } from './question-screen';

export interface ClientOption {
  id: string;
  text: string;
}

/** Mirrors the `AnswerShape` returned by `GET /api/games/:id/rounds/:roundNumber`. */
export interface AnswerShape {
  selectedOptionId: string | null;
  isSkipped: boolean;
}

/**
 * One question's full reveal payload from the API. `creatorPrediction` /
 * `partnerPrediction` are present ONLY for a MIROIR round — their absence
 * (not merely `null`) is how this module tells a MIROIR question apart
 * from a SCENARIO / FACEAFACE one, matching the route's `...(isMirror ? {
 * creatorPrediction, partnerPrediction } : {})` shape exactly.
 */
export interface QuestionResultEntry {
  id: string;
  prompt: string;
  options: ClientOption[];
  creatorAnswer: AnswerShape;
  partnerAnswer: AnswerShape;
  creatorPrediction?: AnswerShape;
  partnerPrediction?: AnswerShape;
}

/** French text shown in place of an option's label for a skipped answer. */
export const SKIPPED_LABEL = 'Passé';

/**
 * Defensive-only fallback for a non-skipped answer whose `selectedOptionId`
 * does not resolve against the question's `options` — a data-integrity
 * situation this module cannot repair, but must render as SOMETHING
 * explicit rather than `undefined` leaking into JSX (this repo's
 * `noUncheckedIndexedAccess` would otherwise make `.find()?.text` silently
 * become `undefined`, i.e. a mysterious blank on screen).
 */
export const UNRESOLVED_LABEL = 'Réponse indisponible';

/** A resolved answer/prediction ready to render: text plus its skip flag. */
export interface DisplayAnswer {
  text: string;
  isSkipped: boolean;
}

/**
 * Resolves one `AnswerShape` against the question's options into display
 * text. A skipped answer (`isSkipped: true`) or one with no
 * `selectedOptionId` renders as the explicit `SKIPPED_LABEL` — never a
 * blank string — per this task's "must not render as a mysterious blank"
 * requirement.
 */
export function toDisplayAnswer(answer: AnswerShape, options: ClientOption[]): DisplayAnswer {
  if (answer.isSkipped || answer.selectedOptionId === null) {
    return { text: SKIPPED_LABEL, isSkipped: true };
  }
  const option = options.find((o) => o.id === answer.selectedOptionId);
  return { text: option?.text ?? UNRESOLVED_LABEL, isSkipped: false };
}

/**
 * Whether ONE prediction matches ONE actual answer. Deliberately generic —
 * it has no idea which of the two arguments belongs to which partner, so it
 * cannot itself be diagonally wrong. Every caller decides which two
 * `AnswerShape`s to pass; `buildRevealRow` below is the ONE caller in this
 * codebase, and it always pairs a prediction with the OTHER partner's
 * answer.
 *
 * A skipped prediction or a skipped actual answer is never a match, per
 * this task's explicit rule — checked before the id comparison so a
 * `null === null` coincidence (both skipped) can never read as "matched".
 */
export function isPredictionMatch(prediction: AnswerShape, actualAnswer: AnswerShape): boolean {
  if (prediction.isSkipped || actualAnswer.isSkipped) return false;
  if (prediction.selectedOptionId === null || actualAnswer.selectedOptionId === null) return false;
  return prediction.selectedOptionId === actualAnswer.selectedOptionId;
}

/** The MIROIR-only half of a reveal row: both predictions plus both verdicts. */
export interface MirrorView {
  creatorPrediction: DisplayAnswer;
  partnerPrediction: DisplayAnswer;
  /** `creatorPrediction` judged against `partnerAnswer` — diagonal, not self. */
  creatorGuessedRight: boolean;
  /** `partnerPrediction` judged against `creatorAnswer` — diagonal, not self. */
  partnerGuessedRight: boolean;
}

/** One question, fully resolved for rendering. No score/points/weight anywhere. */
export interface RevealRow {
  id: string;
  prompt: string;
  creatorAnswer: DisplayAnswer;
  partnerAnswer: DisplayAnswer;
  /** `null` for SCENARIO / FACEAFACE rounds, which carry no predictions. */
  mirror: MirrorView | null;
  /**
   * Did the couple land together on this question?
   *
   *  - MIROIR: both predictions were right. Mutual on purpose — "we
   *    understood each other" is a claim about the pair, and one partner
   *    guessing while the other missed is not that.
   *  - FACEAFACE: both chose the same option.
   *  - SCENARIO: `null`. There is nothing to align on — each partner
   *    answers for themselves against a weight they never see — and
   *    inventing a verdict here would tell a couple they "diverged" on a
   *    round that was never a comparison.
   *
   * A skipped answer is never an alignment: a joker is a pass, not an
   * agreement.
   */
  aligned: boolean | null;
}

/** Both partners picked the same option, neither of them having skipped. */
function isSameChoice(a: AnswerShape, b: AnswerShape): boolean {
  if (a.isSkipped || b.isSkipped) return false;
  if (a.selectedOptionId === null || b.selectedOptionId === null) return false;
  return a.selectedOptionId === b.selectedOptionId;
}

/**
 * Resolves one API question entry into a render-ready `RevealRow`,
 * including the diagonal MIROIR match wiring described in this module's
 * header. `creatorPrediction` / `partnerPrediction` being present at all
 * (not their content) is what decides whether `mirror` is built — matching
 * the route's per-round-type response shape exactly, so a MIROIR question
 * that happens to have two skipped predictions still renders its (skipped)
 * mirror section rather than being mistaken for a non-MIROIR question.
 */
export function buildRevealRow(entry: QuestionResultEntry, roundType: string): RevealRow {
  const creatorAnswer = toDisplayAnswer(entry.creatorAnswer, entry.options);
  const partnerAnswer = toDisplayAnswer(entry.partnerAnswer, entry.options);

  const { creatorPrediction, partnerPrediction } = entry;
  const mirror: MirrorView | null =
    creatorPrediction !== undefined && partnerPrediction !== undefined
      ? {
          creatorPrediction: toDisplayAnswer(creatorPrediction, entry.options),
          partnerPrediction: toDisplayAnswer(partnerPrediction, entry.options),
          // Diagonal — see this module's header comment. NEVER compare a
          // prediction against its own author's answer.
          creatorGuessedRight: isPredictionMatch(creatorPrediction, entry.partnerAnswer),
          partnerGuessedRight: isPredictionMatch(partnerPrediction, entry.creatorAnswer),
        }
      : null;

  const aligned =
    mirror !== null
      ? mirror.creatorGuessedRight && mirror.partnerGuessedRight
      : roundType === 'FACEAFACE'
        ? isSameChoice(entry.creatorAnswer, entry.partnerAnswer)
        : null;

  return { id: entry.id, prompt: entry.prompt, creatorAnswer, partnerAnswer, mirror, aligned };
}

/**
 * Maps every question in a round's reveal payload through
 * `buildRevealRow`.
 *
 * `roundType` has no default: the caller holds it (the route returns it
 * beside the questions) and a default would silently turn a FACEAFACE
 * round into "nothing to align on" the day someone forgets to pass it.
 */
export function buildRevealRows(questions: QuestionResultEntry[], roundType: string): RevealRow[] {
  return questions.map((entry) => buildRevealRow(entry, roundType));
}

/** The headline and its one-line follow-up, above a finished round. */
export interface RoundVerdict {
  headline: string;
  subline: string;
  /** Questions the couple landed together on, or `null` where the round has no such notion. */
  alignedCount: number | null;
  total: number;
}

/**
 * What to say about a round that just ended.
 *
 * The canvas prints a count — "Vous vous êtes compris 4 fois sur 5" — and
 * that is a far better opening than "Ce que vous avez répondu": it tells
 * the couple something they did not already know, in the first line, in
 * their own terms. It stays scrupulously free of points: this screen must
 * never show a score, and a count of shared answers is not one (see this
 * module's header).
 */
export function roundVerdict(rows: readonly RevealRow[], roundType: string): RoundVerdict {
  const total = rows.length;

  if (roundType === 'SCENARIO') {
    return {
      headline: 'Chacun a répondu pour soi',
      subline: 'Ces réponses-là ne se comparent pas — elles comptent pour le score final.',
      alignedCount: null,
      total,
    };
  }

  const alignedCount = rows.filter((row) => row.aligned === true).length;
  const verb = roundType === 'FACEAFACE' ? 'Vous étiez d’accord' : 'Vous vous êtes compris';
  const subline =
    total === 0
      ? 'Aucune question dans cette manche.'
      : alignedCount === total
        ? 'Pas une seule divergence.'
        : alignedCount === 0
          ? 'Vous avez tout à vous raconter.'
          : 'Voilà où vous avez divergé.';

  return {
    headline: `${verb} ${alignedCount} fois sur ${total}`,
    subline,
    alignedCount,
    total,
  };
}

export type RevealBootDecision =
  | { kind: 'load' }
  | { kind: 'navigate'; path: string }
  | { kind: 'error'; message: string };

/**
 * What to do on mount, given the authoritative `phase` from
 * `GET /api/games/current`. This screen is READ-ONLY for phase purposes —
 * unlike `/question`'s `bootDecisionForPhase`, there is no mutating call to
 * gate; a session already in `ROUND_REVEAL` simply loads. Any OTHER known
 * phase (a stale tab, a deep link after the couple already advanced) is
 * routed to the screen that owns it via `routeForPhase`, and an
 * unrecognized phase is an error, never a guessed route — same rule as
 * every other `/jeu/*` page in this lot.
 */
export function revealBootDecision(sessionId: string, phase: string): RevealBootDecision {
  if (phase === 'ROUND_REVEAL') return { kind: 'load' };
  const path = routeForPhase(sessionId, phase);
  if (path === null) return { kind: 'error', message: UNKNOWN_PHASE_MESSAGE };
  return { kind: 'navigate', path };
}

export type AdvanceOutcome =
  | { kind: 'navigate'; path: string }
  | { kind: 'error'; message: string };

/**
 * Where a successful `POST /api/games/:id/round/advance` sends the couple,
 * from the `phase` in its response (`ROUND_INTRO` for rounds 1-2, `COMPLETE`
 * for round 3 — see that route's doc comment). Delegates to `routeForPhase`
 * rather than branching on the response's `gameCompleted` boolean directly:
 * the two ARE equivalent for this endpoint's only two possible outcomes,
 * but going through the shared phase map means an unrecognized phase still
 * surfaces as an explicit error instead of a guessed route, exactly like
 * every other post-mutation navigation in this lot.
 *
 * `sessionId` MUST be the id `GET /api/games/current` returned on this
 * page's mount, never a route param — same rule as every sibling screen.
 */
export function nextPathAfterAdvance(sessionId: string, phase: string): AdvanceOutcome {
  const path = routeForPhase(sessionId, phase);
  if (path === null) return { kind: 'error', message: UNKNOWN_PHASE_MESSAGE };
  return { kind: 'navigate', path };
}

export interface RevealColumnLabels {
  /** Header for the column carrying `RevealRow.creatorAnswer` / `mirror.creatorPrediction`. */
  creatorLabel: string;
  /** Header for the column carrying `RevealRow.partnerAnswer` / `mirror.partnerPrediction`. */
  partnerLabel: string;
}

const YOU_LABEL = 'Toi';

/** Fallback used when the partner has no name recorded on their account. */
export const PARTNER_FALLBACK_LABEL = 'Ton/ta partenaire';

/**
 * Which display name belongs over the "creator" column vs the "partner"
 * column, from the CALLER's point of view — `RevealRow`'s two sides are
 * fixed by database role, but a viewer wants to read "Toi" over their own
 * answers regardless of which role they hold. Same caution as
 * `pass-device.ts`'s `passDeviceTarget`: swapping `viewerRole === 'CREATOR'`
 * for `viewerRole === 'PARTNER'` here is a one-character, easy-to-miss
 * inversion that is invisible while testing solo (every answer would just
 * read "Toi" on both columns' worth of manual eyeballing unless the two
 * branches are pinned by tests).
 *
 * An unrecognized `viewerRole` does NOT block the screen (unlike
 * `passDeviceTarget`, which blocks the pass-the-device hand-off) — both
 * partners are looking at the same screen together here, so a neutral,
 * role-based label pair is a safe, non-blocking fallback rather than an
 * error state.
 */
export function revealColumnLabels(
  viewerRole: string,
  partnerName: string | null,
): RevealColumnLabels {
  const partnerLabel = partnerName ?? PARTNER_FALLBACK_LABEL;
  if (viewerRole === 'CREATOR') return { creatorLabel: YOU_LABEL, partnerLabel };
  if (viewerRole === 'PARTNER') return { creatorLabel: partnerLabel, partnerLabel: YOU_LABEL };
  return { creatorLabel: 'Créateur·rice', partnerLabel: 'Partenaire' };
}
