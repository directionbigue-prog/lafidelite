// French display labels for the three rounds (Lot 2, Task 19), shared by
// the interstitial screens and the question/reveal pages that follow.
//
// The round TYPE is derived from the round NUMBER rather than read from
// the API, because the mapping is fixed by the game's design and enforced
// at creation time: `POST /api/games` always builds round 1 as MIROIR,
// round 2 as SCENARIO and round 3 as FACEAFACE, in that order. Keeping the
// derivation here (pure, unit-tested) means the interstitials need no
// extra network round-trip just to know what to announce.
//
// `roundLabel` returns `null` for anything outside 1-3 rather than
// guessing — same rule as `routeForPhase`: an unknown state is surfaced,
// never silently rendered as some default round.

export type RoundType = 'MIROIR' | 'SCENARIO' | 'FACEAFACE';

export interface RoundLabel {
  /** The round's stable type, for callers that branch on it. */
  type: RoundType;
  /** Display name, e.g. "Miroir". */
  title: string;
  /** One-line reminder of how this round is played. */
  rule: string;
}

const ROUND_LABELS: readonly RoundLabel[] = [
  {
    type: 'MIROIR',
    title: 'Miroir',
    rule: 'Chacun répond pour soi, puis devine la réponse de l’autre.',
  },
  {
    type: 'SCENARIO',
    title: 'Scénarios',
    rule: 'Chacun répond pour soi, face à des situations imaginaires.',
  },
  {
    type: 'FACEAFACE',
    title: 'Face à face',
    rule: 'Même question pour les deux : à vous de tomber d’accord.',
  },
];

/**
 * Total rounds in one game — used to render "Manche 2 sur 3".
 *
 * Re-exported from the state machine rather than derived from
 * `ROUND_LABELS.length`: the machine decides when the last round ends, so
 * it owns the number. `round-labels.test.ts` asserts the label table has
 * exactly this many entries, so adding a fourth round without a label
 * fails loudly instead of rendering "Manche 4 sur 3".
 */
export { TOTAL_ROUNDS } from '@/lib/server/game/state-machine';

/**
 * Questions in one round — re-exported for the same reason as
 * `TOTAL_ROUNDS`: the state machine decides when a round ends, so it owns
 * the number. Screens that want "15 questions" multiply the two rather
 * than typing a literal that silently stops being true.
 */
export { QUESTIONS_PER_ROUND } from '@/lib/server/game/state-machine';

/**
 * The label for a 1-indexed round number, or `null` when the number is
 * outside the game's three rounds (0, 4, NaN, a non-integer…). Callers
 * render an explicit error for `null` rather than falling back to round 1.
 */
export function roundLabel(roundNumber: number): RoundLabel | null {
  if (!Number.isInteger(roundNumber)) return null;
  return ROUND_LABELS[roundNumber - 1] ?? null;
}

/**
 * The label for a round TYPE, for callers holding a `roundType` string
 * rather than a round number — the landing page's category grid groups the
 * question bank by round and has no round numbers to work from.
 *
 * Exists so those callers do not re-declare "Miroir" / "Scénarios" /
 * "Face à face" locally: this table stays the one place the three rounds
 * are named. Returns `null` for an unrecognised type, same rule as
 * `roundLabel` — an unknown round is surfaced by the caller, never
 * silently rendered as some default.
 */
export function roundLabelForType(type: string): RoundLabel | null {
  return ROUND_LABELS.find((label) => label.type === type) ?? null;
}
