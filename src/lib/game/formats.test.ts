import { describe, expect, it } from 'vitest';
import {
  GAME_FORMATS,
  DEFAULT_FORMAT_ID,
  formatById,
  questionsPerRound,
  type GameFormatId,
} from './formats';
import { TOTAL_ROUNDS } from './round-labels';

describe('questionsPerRound', () => {
  it('splits the standard format evenly', () => {
    expect(questionsPerRound(15)).toEqual([5, 5, 5]);
  });

  it('splits the long format evenly', () => {
    expect(questionsPerRound(30)).toEqual([10, 10, 10]);
  });

  it('front-loads the remainder rather than dropping a manche', () => {
    // Express is 5 over 3 rounds. Dropping a round would give a quick game
    // that never reaches Face à face — a different game, not a shorter one.
    expect(questionsPerRound(5)).toEqual([2, 2, 1]);
  });

  it('never produces an empty round', () => {
    // A round of zero questions is a state the machine cannot advance
    // through: it would sit in ANSWERING with nothing to answer.
    for (let total = 1; total <= 40; total += 1) {
      const split = questionsPerRound(total);
      expect(
        split.every((n) => n >= 1),
        `total=${total} -> ${split.join('/')}`,
      ).toBe(true);
    }
  });

  it('always sums back to the requested total', () => {
    for (let total = 1; total <= 40; total += 1) {
      const sum = questionsPerRound(total).reduce((a, b) => a + b, 0);
      expect(sum, `total=${total}`).toBe(total);
    }
  });

  it('yields fewer rounds than asked when the total is smaller than the round count', () => {
    expect(questionsPerRound(2)).toEqual([1, 1]);
    expect(questionsPerRound(1)).toEqual([1]);
  });

  it('returns nothing for a nonsensical request instead of guessing', () => {
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(questionsPerRound(bad)).toEqual([]);
    }
    expect(questionsPerRound(10, 0)).toEqual([]);
  });
});

describe('GAME_FORMATS', () => {
  it('matches the totals the canvases state', () => {
    const totals = Object.fromEntries(GAME_FORMATS.map((f) => [f.id, f.totalQuestions]));
    expect(totals).toEqual({ EXPRESS: 5, STANDARD: 15, LONGUE_SOIREE: 30 });
  });

  it('keeps all three manches in every format', () => {
    // The rule the whole distribution exists to protect.
    for (const f of GAME_FORMATS) {
      expect(questionsPerRound(f.totalQuestions), f.id).toHaveLength(TOTAL_ROUNDS);
    }
  });

  it('declares the default as one of its own entries', () => {
    expect(GAME_FORMATS.some((f) => f.id === DEFAULT_FORMAT_ID)).toBe(true);
  });

  it('has no duplicate ids', () => {
    expect(new Set(GAME_FORMATS.map((f) => f.id)).size).toBe(GAME_FORMATS.length);
  });
});

describe('formatById', () => {
  it('finds every declared format', () => {
    for (const f of GAME_FORMATS) expect(formatById(f.id)?.totalQuestions).toBe(f.totalQuestions);
  });

  it('fails CLOSED on anything it does not recognise', () => {
    // Never fall back to the default: an unrecognised stored value means the
    // session was written by code that no longer matches this one, and
    // silently dealing a 15-question game to a couple who chose 30 is worse
    // than an error somebody notices.
    for (const bad of ['', 'standard', 'MOYEN', null, undefined, 'EXPRESS ']) {
      expect(formatById(bad as GameFormatId), String(bad)).toBeNull();
    }
  });
});
