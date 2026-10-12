import { describe, expect, it } from 'vitest';
import { standingSummary, roundPreviews } from './start-summary';
import { roundLabel, TOTAL_ROUNDS } from './round-labels';
import { complicityLevelLabel } from './resultats';

describe('standingSummary', () => {
  it('invites rather than reports before the first game', () => {
    // A couple who has never finished a game sits at 0. Showing them
    // "Découverte · 0" reads as a verdict on something they have not done.
    const summary = standingSummary('DECOUVERTE', 0, complicityLevelLabel);
    expect(summary.isFirstGame).toBe(true);
    expect(summary.levelLabel).toBeNull();
    expect(summary.caption).toContain(String(TOTAL_ROUNDS));
    // The caption must NOT name a question count: the formats give 5, 15
    // or 30, and the couple has not chosen yet when this line is read.
    expect(summary.caption).not.toMatch(/\bquestions?\b/);
  });

  it('reports the level once the couple has actually scored', () => {
    const summary = standingSummary('COMPLICES', 248, complicityLevelLabel);
    expect(summary.isFirstGame).toBe(false);
    expect(summary.levelLabel).toBe('Complices');
    expect(summary.score).toBe(248);
  });

  it('still reports DECOUVERTE for a couple who has played and scored low', () => {
    // The distinction that matters: DECOUVERTE is both the starting level
    // AND a real standing after several close games. Guarding on the level
    // instead of the score would erase the second case.
    const summary = standingSummary('DECOUVERTE', 40, complicityLevelLabel);
    expect(summary.isFirstGame).toBe(false);
    expect(summary.levelLabel).toBe('Découverte');
  });

  it('treats a negative total as "nothing played yet" rather than rendering it', () => {
    expect(standingSummary('DECOUVERTE', -5, complicityLevelLabel).isFirstGame).toBe(true);
  });

  it('falls back to no label when the server sends no level', () => {
    const summary = standingSummary(null, 120, complicityLevelLabel);
    expect(summary.levelLabel).toBeNull();
    expect(summary.score).toBe(120);
  });
});

describe('the game’s advertised shape', () => {
  it('promises three rounds and never a question count', () => {
    // The old rule here checked that a `QUESTIONS_PER_GAME` constant was
    // derived rather than typed. Derivation was never the problem: the
    // constant was correct and the SCREEN was wrong, because the length
    // belongs to the format the couple picks next.
    for (const summary of [
      standingSummary('DECOUVERTE', 0, complicityLevelLabel),
      standingSummary('COMPLICES', 248, complicityLevelLabel),
    ]) {
      expect(summary.caption).not.toMatch(/\b(5|15|30)\b/);
    }
  });
});

describe('roundPreviews', () => {
  it('lists every round in play order with the names used mid-game', () => {
    const rounds = roundPreviews(roundLabel);
    expect(rounds).toHaveLength(TOTAL_ROUNDS);
    expect(rounds.map((r) => r.title)).toEqual(['Miroir', 'Scénarios', 'Face à face']);
    expect(rounds.map((r) => r.num)).toEqual(['01', '02', '03']);
  });

  it('carries each round rule verbatim from the shared label table', () => {
    const rounds = roundPreviews(roundLabel);
    expect(rounds[0]?.rule).toBe(roundLabel(1)?.rule);
  });

  it('omits a round the game cannot name rather than inventing one', () => {
    const rounds = roundPreviews((n) => (n === 2 ? null : roundLabel(n)));
    expect(rounds.map((r) => r.num)).toEqual(['01', '03']);
  });
});
