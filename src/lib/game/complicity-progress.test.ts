import { describe, expect, it } from 'vitest';
import { complicityProgress } from './complicity-progress';
import { COMPLICITY_THRESHOLDS } from '@/lib/server/game/scoring';

describe('complicityProgress', () => {
  it('starts at the first band with an empty bar', () => {
    const p = complicityProgress(0);
    expect(p.level).toBe('DECOUVERTE');
    expect(p.nextLevel).toBe('COMPLICES');
    expect(p.pointsToNext).toBe(100);
    expect(p.fill).toBe(0);
  });

  it('fills proportionally WITHIN the current band, not across the whole ladder', () => {
    // 200 is halfway through COMPLICES (100..300) — not a third of the way
    // to 600. Filling against the ladder instead of the band is the
    // plausible-looking mistake this pins.
    const p = complicityProgress(200);
    expect(p.level).toBe('COMPLICES');
    expect(p.fill).toBeCloseTo(0.5, 5);
  });

  it('is the canvas example: 248 points, Complices, 52 before Fusionnels', () => {
    // Planche 01 shows "248 / Complices / 52 points avant le niveau …".
    // The design's next-level label reads Inséparables, which the shipped
    // thresholds do not agree with (300 opens Fusionnels): the DATA is
    // authoritative here, and the screen renders whatever the ladder says.
    const p = complicityProgress(248);
    expect(p.level).toBe('COMPLICES');
    expect(p.pointsToNext).toBe(52);
    expect(p.nextLevel).toBe('FUSIONNELS');
  });

  it('lands on the new band exactly at its floor, with an empty bar', () => {
    const p = complicityProgress(300);
    expect(p.level).toBe('FUSIONNELS');
    expect(p.fill).toBe(0);
    expect(p.pointsToNext).toBe(300);
  });

  it('reports no next level at the top band', () => {
    const p = complicityProgress(999);
    expect(p.level).toBe('INSEPARABLES');
    expect(p.nextLevel).toBeNull();
    expect(p.pointsToNext).toBeNull();
    expect(p.fill).toBe(1);
  });

  it('clamps a nonsensical score instead of rendering a negative bar', () => {
    for (const bad of [-50, Number.NaN, Number.NEGATIVE_INFINITY]) {
      const p = complicityProgress(bad);
      expect(p.level).toBe('DECOUVERTE');
      expect(p.fill).toBe(0);
    }
  });

  it('never returns a fill outside 0..1 across the whole ladder', () => {
    const top = COMPLICITY_THRESHOLDS[COMPLICITY_THRESHOLDS.length - 1];
    for (let score = 0; score <= (top?.min ?? 600) + 200; score += 7) {
      const { fill } = complicityProgress(score);
      expect(fill).toBeGreaterThanOrEqual(0);
      expect(fill).toBeLessThanOrEqual(1);
    }
  });

  it('agrees with the scoring engine on every declared threshold', () => {
    // The reason this module imports the thresholds rather than copying
    // them. If someone retunes the ladder, this fails loudly instead of
    // the bar quietly filling against a stale scale.
    for (const band of COMPLICITY_THRESHOLDS) {
      expect(complicityProgress(band.min).level).toBe(band.level);
    }
  });
});
