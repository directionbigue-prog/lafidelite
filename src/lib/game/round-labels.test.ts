import { describe, it, expect } from 'vitest';
import { roundLabel, TOTAL_ROUNDS } from './round-labels';

describe('roundLabel', () => {
  it('maps round 1 to Miroir', () => {
    expect(roundLabel(1)).toEqual({
      type: 'MIROIR',
      title: 'Miroir',
      rule: 'Chacun répond pour soi, puis devine la réponse de l’autre.',
    });
  });

  it('maps round 2 to Scénarios', () => {
    expect(roundLabel(2)).toEqual({
      type: 'SCENARIO',
      title: 'Scénarios',
      rule: 'Chacun répond pour soi, face à des situations imaginaires.',
    });
  });

  it('maps round 3 to Face à face', () => {
    expect(roundLabel(3)).toEqual({
      type: 'FACEAFACE',
      title: 'Face à face',
      rule: 'Même question pour les deux : à vous de tomber d’accord.',
    });
  });

  // The order is not cosmetic: it mirrors the order `POST /api/games`
  // persists the three GameRound rows in. A silent reordering here would
  // announce the wrong round to the players.
  it('keeps the creation order MIROIR -> SCENARIO -> FACEAFACE', () => {
    expect([roundLabel(1)?.type, roundLabel(2)?.type, roundLabel(3)?.type]).toEqual([
      'MIROIR',
      'SCENARIO',
      'FACEAFACE',
    ]);
  });

  it('gives every round a non-empty French rule reminder', () => {
    for (const n of [1, 2, 3]) {
      expect(roundLabel(n)?.rule.length).toBeGreaterThan(20);
    }
  });

  // Fail loudly rather than defaulting to round 1 — an out-of-range round
  // number means the session is in a state this build does not understand.
  it('returns null outside rounds 1-3 instead of guessing', () => {
    expect(roundLabel(0)).toBeNull();
    expect(roundLabel(4)).toBeNull();
    expect(roundLabel(-1)).toBeNull();
  });

  it('returns null for a non-integer round number', () => {
    expect(roundLabel(1.5)).toBeNull();
    expect(roundLabel(Number.NaN)).toBeNull();
  });

  it('reports three rounds in total', () => {
    expect(TOTAL_ROUNDS).toBe(3);
  });

  // TOTAL_ROUNDS now comes from the state machine, which owns when the
  // last round ends. This asserts the label table kept up: adding a
  // fourth round there without writing its label would otherwise render
  // "Manche 4 sur 3" with a blank title.
  it('has a label for every round the state machine counts', () => {
    for (let n = 1; n <= TOTAL_ROUNDS; n += 1) {
      expect(roundLabel(n), `round ${n}`).not.toBeNull();
    }
    expect(roundLabel(TOTAL_ROUNDS + 1)).toBeNull();
  });
});
