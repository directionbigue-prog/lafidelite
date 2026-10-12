import { describe, expect, it } from 'vitest';
import { gameProgress } from './progress';

/** The Standard format: three rounds of five. */
const STANDARD = [5, 5, 5];
/** Express — the format that does NOT divide evenly. */
const EXPRESS = [2, 2, 1];
const LONGUE_SOIREE = [10, 10, 10];

describe('gameProgress', () => {
  it('counts only questions already answered, not the one on screen', () => {
    // On question 1 of round 1 nothing is answered yet. Counting the
    // current question would show progress for work not done.
    expect(
      gameProgress({ kind: 'question', roundNumber: 1, questionNumber: 1 }, STANDARD)?.answered,
    ).toBe(0);
    expect(
      gameProgress({ kind: 'question', roundNumber: 1, questionNumber: 3 }, STANDARD)?.answered,
    ).toBe(2);
  });

  it('carries completed rounds forward', () => {
    const p = gameProgress({ kind: 'question', roundNumber: 2, questionNumber: 3 }, STANDARD);
    expect(p?.answered).toBe(7);
  });

  it('counts a revealed round as fully answered', () => {
    expect(gameProgress({ kind: 'roundDone', roundNumber: 2 }, STANDARD)?.answered).toBe(10);
  });

  it('counts a round about to start as nothing answered in it', () => {
    expect(gameProgress({ kind: 'roundStart', roundNumber: 3 }, STANDARD)?.answered).toBe(10);
  });

  it('reaches exactly the full total on the last reveal', () => {
    const p = gameProgress({ kind: 'roundDone', roundNumber: 3 }, STANDARD);
    expect(p?.answered).toBe(15);
    expect(p?.total).toBe(15);
    expect(p?.segments.every((s) => s.filled)).toBe(true);
  });

  // ── The formats. Each of these was WRONG while the round length was a
  // hardcoded 5, and none of them failed loudly. ─────────────────────
  describe('formats whose rounds are not five questions', () => {
    it('sums uneven rounds instead of multiplying (Express is 2/2/1)', () => {
      const p = gameProgress({ kind: 'question', roundNumber: 3, questionNumber: 1 }, EXPRESS);
      expect(p?.total).toBe(5);
      // 2 + 2 answered before the final round's single question.
      expect(p?.answered).toBe(4);
      expect(p?.label).toBe('Question 5 / 5');
    });

    it('draws one segment per question in THIS round, not five', () => {
      expect(
        gameProgress({ kind: 'question', roundNumber: 1, questionNumber: 1 }, EXPRESS)?.segments,
      ).toHaveLength(2);
      expect(
        gameProgress({ kind: 'question', roundNumber: 3, questionNumber: 1 }, EXPRESS)?.segments,
      ).toHaveLength(1);
      expect(
        gameProgress({ kind: 'question', roundNumber: 1, questionNumber: 1 }, LONGUE_SOIREE)
          ?.segments,
      ).toHaveLength(10);
    });

    it('still renders past question 5 of a long round', () => {
      // The regression this module was rewritten for: the old range check
      // rejected question 6 as impossible and the bar silently vanished
      // for the second half of every Longue soirée round.
      const p = gameProgress(
        { kind: 'question', roundNumber: 2, questionNumber: 8 },
        LONGUE_SOIREE,
      );
      expect(p).not.toBeNull();
      expect(p?.label).toBe('Question 18 / 30');
    });

    it('refuses a question number past the end of a SHORT round', () => {
      // The mirror image: question 3 does not exist in an Express round.
      expect(
        gameProgress({ kind: 'question', roundNumber: 1, questionNumber: 3 }, EXPRESS),
      ).toBeNull();
    });
  });

  it('fills the answered questions and the one on screen, leaves the rest empty', () => {
    const p = gameProgress({ kind: 'question', roundNumber: 2, questionNumber: 3 }, STANDARD);
    expect(p?.segments.map((s) => s.filled)).toEqual([true, true, true, false, false]);
    expect(p?.segments.map((s) => s.isCurrent)).toEqual([false, false, true, false, false]);
  });

  it('leaves every segment empty on a round that has not started', () => {
    const p = gameProgress({ kind: 'roundStart', roundNumber: 2 }, STANDARD);
    expect(p?.segments.every((s) => !s.filled)).toBe(true);
    expect(p?.segments.every((s) => !s.isCurrent)).toBe(true);
  });

  it('numbers a question across the whole game, not within its round', () => {
    // "Question 7 / 15" is what the design canvas shows, and it is what a
    // couple actually wants to know: how much of the evening is left.
    const p = gameProgress({ kind: 'question', roundNumber: 2, questionNumber: 2 }, STANDARD);
    expect(p?.label).toBe('Question 7 / 15');
  });

  it('labels an interstitial with the round alone', () => {
    expect(gameProgress({ kind: 'roundStart', roundNumber: 2 }, STANDARD)?.label).toBe(
      'Manche 2 sur 3',
    );
  });

  it('labels a finished round as finished', () => {
    expect(gameProgress({ kind: 'roundDone', roundNumber: 2 }, STANDARD)?.label).toBe('Terminée');
  });

  it('carries the same round name the interstitials announce', () => {
    expect(gameProgress({ kind: 'roundStart', roundNumber: 2 }, STANDARD)?.roundTitle).toBe(
      'Scénarios',
    );
  });

  describe('returns null rather than a wrong bar', () => {
    it.each([
      ['round 0', { kind: 'roundStart', roundNumber: 0 } as const],
      ['a round past the table', { kind: 'roundStart', roundNumber: 4 } as const],
      ['a non-integer round', { kind: 'roundStart', roundNumber: 1.5 } as const],
      ['question 0', { kind: 'question', roundNumber: 1, questionNumber: 0 } as const],
      [
        'a non-integer question',
        { kind: 'question', roundNumber: 1, questionNumber: 2.5 } as const,
      ],
    ])('%s', (_name, marker) => {
      expect(gameProgress(marker, STANDARD)).toBeNull();
    });

    it.each([
      ['an empty round table', []],
      ['a round of zero questions', [5, 0, 5]],
      ['a fractional round length', [5, 2.5, 5]],
    ])('%s', (_name, layout) => {
      expect(gameProgress({ kind: 'roundStart', roundNumber: 1 }, layout)).toBeNull();
    });
  });
});

describe('the chapter heading', () => {
  it('names the round the way the canvas prints it', () => {
    expect(gameProgress({ kind: 'roundStart', roundNumber: 2 }, STANDARD)?.heading).toBe(
      'Manche 2 · Scénarios',
    );
  });
});
