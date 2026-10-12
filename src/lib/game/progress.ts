// Where a couple is inside a game, for the header every in-game screen
// shares.
//
// The screens knew their own round and question number but never showed the
// whole: a player on question 3 of round 2 could not tell whether they were
// near the end or barely started. Three of the five in-game screens showed
// no position at all.
//
// ── Why the round lengths are a PARAMETER ────────────────────────────
// This module used to multiply a hardcoded `QUESTIONS_PER_ROUND = 5`. That
// was true of every game until the three formats shipped (Express 5,
// Standard 15, Longue soirée 30): an Express round holds 2 questions and a
// Longue soirée round holds 10. The constant then produced, silently, two
// wrong screens — "Question 1 sur 5" in a round of 2, and NO progress bar
// at all from question 6 of a Longue soirée onward, because the range
// check rejected the position as impossible.
//
// So the lengths now come from the session itself: `GET /api/games/current`
// returns `questionsPerRound`, one entry per round, counted from the rows
// the game was actually built with. Nothing here may re-derive them by
// multiplication — the formats do not divide evenly (Express is 2/2/1),
// which is exactly the assumption that broke.
//
// Pure, so it is unit-tested in Node — the repo ships no jsdom, and logic
// left inside a component cannot be covered. The component draws what this
// returns and decides nothing.

import { roundLabel } from '@/lib/game/round-labels';

/** Where the screen asking sits in the game. */
export type ProgressMarker =
  /** On a question. */
  | { kind: 'question'; roundNumber: number; questionNumber: number }
  /** On the interstitial before a round's first question, or handing over. */
  | { kind: 'roundStart'; roundNumber: number }
  /** On a round's reveal — that round's questions are all answered. */
  | { kind: 'roundDone'; roundNumber: number };

/**
 * One tick of the round's bar — the design canvas draws a segment per
 * QUESTION in the current round, not one per round, so a couple reads
 * "two of five answered in this chapter" at a glance.
 */
export interface QuestionSegment {
  questionNumber: number;
  /** Answered, or the one being answered right now. */
  filled: boolean;
  isCurrent: boolean;
}

export interface GameProgress {
  /** "Question 7 / 15", or the round line on an interstitial. */
  label: string;
  /**
   * "Manche 2 · Scénarios" — the chapter marker the canvas prints above
   * every in-game screen. Falls back to the round number alone when the
   * round has no name, rather than trailing a bare separator.
   */
  heading: string;
  /** The round's French name, when the round has one. */
  roundTitle: string | null;
  /** Questions finished in the whole game. */
  answered: number;
  /** Questions in the whole game. */
  total: number;
  segments: QuestionSegment[];
}

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

/**
 * Reject a malformed round table outright rather than working around it.
 * A `[5, 5]` where three rounds are expected is a server contract change,
 * not a display edge case, and drawing two-thirds of a bar for it would
 * hide that.
 */
function isValidLayout(questionsPerRound: readonly number[]): boolean {
  return questionsPerRound.length >= 1 && questionsPerRound.every(isPositiveInt);
}

/**
 * The progress a screen should display, or `null` when the position makes
 * no sense for this game (round 0, question 6 of a 5-question round, a
 * non-integer, a round table the server could not have produced).
 *
 * `null` rather than a clamped guess, matching `roundLabel` and
 * `routeForPhase`: a screen that cannot say where it is renders no
 * progress bar at all, instead of confidently drawing the wrong one.
 *
 * @param questionsPerRound one entry per round, in round order, from
 *   `GET /api/games/current`. Never a computed or assumed value.
 */
export function gameProgress(
  marker: ProgressMarker,
  questionsPerRound: readonly number[],
): GameProgress | null {
  if (!isValidLayout(questionsPerRound)) return null;

  const { roundNumber } = marker;
  if (!isPositiveInt(roundNumber) || roundNumber > questionsPerRound.length) return null;

  const inThisRound = questionsPerRound[roundNumber - 1] ?? 0;
  if (
    marker.kind === 'question' &&
    (!isPositiveInt(marker.questionNumber) || marker.questionNumber > inThisRound)
  ) {
    return null;
  }

  // Summed, never multiplied: Express is 2/2/1.
  const total = questionsPerRound.reduce((sum, n) => sum + n, 0);
  const answeredInEarlierRounds = questionsPerRound
    .slice(0, roundNumber - 1)
    .reduce((sum, n) => sum + n, 0);
  const answeredInThisRound =
    marker.kind === 'question'
      ? marker.questionNumber - 1
      : marker.kind === 'roundDone'
        ? inThisRound
        : 0;
  const answered = answeredInEarlierRounds + answeredInThisRound;

  const currentQuestionNumber = marker.kind === 'question' ? marker.questionNumber : null;
  const segments: QuestionSegment[] = [];
  for (let n = 1; n <= inThisRound; n += 1) {
    segments.push({
      questionNumber: n,
      // On a reveal the whole round is behind us; on an interstitial none
      // of it has been played yet.
      filled:
        marker.kind === 'roundDone'
          ? true
          : currentQuestionNumber !== null && n <= currentQuestionNumber,
      isCurrent: n === currentQuestionNumber,
    });
  }

  const totalRounds = questionsPerRound.length;
  // A finished round says so rather than repeating the chapter marker
  // that is already on the same line to its left.
  const label =
    marker.kind === 'question'
      ? `Question ${answered + 1} / ${total}`
      : marker.kind === 'roundDone'
        ? 'Terminée'
        : `Manche ${roundNumber} sur ${totalRounds}`;

  const roundTitle = roundLabel(roundNumber)?.title ?? null;

  return {
    label,
    heading:
      roundTitle === null ? `Manche ${roundNumber}` : `Manche ${roundNumber} · ${roundTitle}`,
    roundTitle,
    answered,
    total,
    segments,
  };
}
