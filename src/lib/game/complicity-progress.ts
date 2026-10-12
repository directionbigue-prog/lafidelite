// "52 points avant le niveau Inséparables" — the progress line under the
// couple score on the web dashboard (planche 01).
//
// Pure, and deliberately reading its thresholds from the scoring engine
// rather than restating them. A second copy of 0/100/300/600 would be
// correct the day it was written and silently wrong the day someone
// retunes the curve, and nothing would fail: the bar would just fill
// against one scale while the level came from another.
//
// `scoring.ts` is safe to import here — its own header states it is
// isomorphic (no `server-only`, Web Crypto rather than `node:crypto`)
// precisely because /demo already pulls it into the browser bundle.
import { COMPLICITY_THRESHOLDS } from '@/lib/server/game/scoring';

export type ComplicityLevel = (typeof COMPLICITY_THRESHOLDS)[number]['level'];

export interface ComplicityProgress {
  level: ComplicityLevel;
  /** `null` once the top band is reached — there is nothing further. */
  nextLevel: ComplicityLevel | null;
  /** Points still needed to reach `nextLevel`; `null` at the top band. */
  pointsToNext: number | null;
  /** 0..1 across the CURRENT band. Always 1 at the top band. */
  fill: number;
}

/**
 * Where a couple sits on the complicity ladder.
 *
 * A score below the first threshold cannot happen (`cumulativeCoupleScore`
 * only ever increments from 0) but is clamped rather than trusted: a bar
 * with a negative fill is a rendering bug that reaches the user, and the
 * guard costs one comparison.
 */
export function complicityProgress(score: number): ComplicityProgress {
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;

  // Walk down to the highest band whose floor the score has reached. The
  // list is ordered ascending, so the last match wins.
  let index = 0;
  for (let i = 0; i < COMPLICITY_THRESHOLDS.length; i++) {
    const band = COMPLICITY_THRESHOLDS[i];
    if (band && safeScore >= band.min) index = i;
  }

  const current = COMPLICITY_THRESHOLDS[index];
  const next = COMPLICITY_THRESHOLDS[index + 1];

  // `current` is always defined (index is a real position) but
  // `noUncheckedIndexedAccess` cannot see that, and a fallback beats a
  // non-null assertion that would hide a genuine off-by-one later.
  if (!current) {
    return { level: 'DECOUVERTE', nextLevel: null, pointsToNext: null, fill: 1 };
  }

  if (!next) {
    return { level: current.level, nextLevel: null, pointsToNext: null, fill: 1 };
  }

  const span = next.min - current.min;
  const into = safeScore - current.min;
  return {
    level: current.level,
    nextLevel: next.level,
    pointsToNext: next.min - safeScore,
    // `span` is positive for every declared band; the guard keeps a
    // mis-ordered future threshold from producing Infinity.
    fill: span > 0 ? Math.min(1, Math.max(0, into / span)) : 1,
  };
}
