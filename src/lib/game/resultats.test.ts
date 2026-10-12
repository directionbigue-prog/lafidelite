import { describe, it, expect } from 'vitest';
import {
  complicityLevelLabel,
  isMaskedResults,
  buildResultsSections,
  type GameResultsUnmasked,
  type GameResultsMasked,
  type GameResultsResponse,
} from './resultats';
import { revealColumnLabels } from './round-reveal';

const COLUMN_LABELS = revealColumnLabels('CREATOR', 'Awa');

function unmaskedFixture(over: Partial<GameResultsUnmasked> = {}): GameResultsUnmasked {
  return {
    coupleScore: 20,
    complicityLevel: 'COMPLICES',
    creatorTitle: "Cœur d'Or",
    partnerTitle: 'Cœur Sincère',
    winnerRole: 'CREATOR',
    conversationPrompts: ['Q1?', 'Q2?', 'Q3?'],
    creatorTotalScore: 55,
    partnerTotalScore: 39,
    gapPercent: (16 / 55) * 100,
    ...over,
  };
}

/**
 * Built WITHOUT the numeric keys at all (never via spreading an unmasked
 * fixture and deleting/undefining fields) — this is what
 * `JSON.parse(await res.text())` actually produces for a masked response,
 * per `route.ts`'s "OMITTED ... not null, not zero" contract.
 */
function maskedFixture(over: Partial<GameResultsMasked> = {}): GameResultsMasked {
  return {
    coupleScore: 20,
    complicityLevel: 'COMPLICES',
    creatorTitle: "Cœur d'Or",
    partnerTitle: "Cœur d'Or",
    winnerRole: 'TIE',
    conversationPrompts: ['Q1?', 'Q2?', 'Q3?'],
    maskedMessage: 'Match serré sur les valeurs, écart sur la connaissance.',
    ...over,
  };
}

describe('complicityLevelLabel', () => {
  it.each([
    ['DECOUVERTE', 'Découverte'],
    ['COMPLICES', 'Complices'],
    ['FUSIONNELS', 'Fusionnels'],
    ['INSEPARABLES', 'Inséparables'],
  ])('maps %s to %s', (raw, expected) => {
    expect(complicityLevelLabel(raw)).toBe(expected);
  });

  it('falls back to the raw value for an unrecognized level (never blocks the screen)', () => {
    expect(complicityLevelLabel('FUTURE_LEVEL')).toBe('FUTURE_LEVEL');
  });
});

describe('isMaskedResults', () => {
  it('is true for a masked response (maskedMessage key present)', () => {
    expect(isMaskedResults(maskedFixture())).toBe(true);
  });

  it('is false for an unmasked response (no maskedMessage key at all)', () => {
    expect(isMaskedResults(unmaskedFixture())).toBe(false);
  });

  it('narrows on key presence, not truthiness — an empty-string maskedMessage still masks', () => {
    expect(isMaskedResults(maskedFixture({ maskedMessage: '' }))).toBe(true);
  });
});

describe('buildResultsSections — order', () => {
  it('always returns sections in the fixed product-required order: coupleScore, complicityLevel, individualScores, titles, conversationPrompts', () => {
    const unmaskedOrder = buildResultsSections(unmaskedFixture(), COLUMN_LABELS).map((s) => s.kind);
    const maskedOrder = buildResultsSections(maskedFixture(), COLUMN_LABELS).map((s) => s.kind);

    const expectedOrder = [
      'coupleScore',
      'complicityLevel',
      'individualScores',
      'titles',
      'conversationPrompts',
    ];
    expect(unmaskedOrder).toEqual(expectedOrder);
    expect(maskedOrder).toEqual(expectedOrder);
  });

  it('exposes coupleScore strictly before individualScores by index (the product requirement in exact terms)', () => {
    const sections = buildResultsSections(unmaskedFixture(), COLUMN_LABELS);
    const coupleScoreIndex = sections.findIndex((s) => s.kind === 'coupleScore');
    const individualScoresIndex = sections.findIndex((s) => s.kind === 'individualScores');
    expect(coupleScoreIndex).toBeGreaterThanOrEqual(0);
    expect(individualScoresIndex).toBeGreaterThan(coupleScoreIndex);
  });
});

describe('buildResultsSections — unmasked content', () => {
  it('carries both numeric scores, labelled via the supplied column labels', () => {
    const sections = buildResultsSections(unmaskedFixture(), COLUMN_LABELS);
    const scores = sections.find((s) => s.kind === 'individualScores');
    expect(scores).toEqual({
      kind: 'individualScores',
      masked: false,
      creatorLabel: 'Toi',
      creatorScore: 55,
      partnerLabel: 'Awa',
      partnerScore: 39,
    });
  });

  it('carries coupleScore, the French complicity label, titles and prompts unchanged', () => {
    const sections = buildResultsSections(unmaskedFixture(), COLUMN_LABELS);
    expect(sections[0]).toEqual({ kind: 'coupleScore', coupleScore: 20 });
    expect(sections[1]).toEqual({ kind: 'complicityLevel', label: 'Complices' });
    expect(sections[3]).toEqual({
      kind: 'titles',
      creatorLabel: 'Toi',
      creatorTitle: "Cœur d'Or",
      partnerLabel: 'Awa',
      partnerTitle: 'Cœur Sincère',
    });
    expect(sections[4]).toEqual({
      kind: 'conversationPrompts',
      prompts: ['Q1?', 'Q2?', 'Q3?'],
    });
  });
});

describe('buildResultsSections — conversationPrompts is untrusted at the boundary', () => {
  // The column is Prisma `Json`, typed `unknown` at the route, and the
  // page renders it with .map() outside any try/catch — a malformed value
  // would take down the whole results screen, not just its last section.
  it('degrades a non-array to an empty list instead of throwing', () => {
    for (const bad of [null, undefined, 42, 'trois choses', { a: 1 }]) {
      const data = {
        ...unmaskedFixture(),
        conversationPrompts: bad,
      } as unknown as GameResultsResponse;
      const sections = buildResultsSections(data, COLUMN_LABELS);
      expect(sections[4]).toEqual({ kind: 'conversationPrompts', prompts: [] });
    }
  });

  it('drops non-string entries rather than coercing them', () => {
    const data = {
      ...unmaskedFixture(),
      conversationPrompts: ['Q1?', { nope: true }, 7, null, 'Q2?'],
    } as unknown as GameResultsResponse;
    expect(buildResultsSections(data, COLUMN_LABELS)[4]).toEqual({
      kind: 'conversationPrompts',
      prompts: ['Q1?', 'Q2?'],
    });
  });

  it('keeps the other four sections intact when the prompts are unusable', () => {
    const data = {
      ...unmaskedFixture(),
      conversationPrompts: null,
    } as unknown as GameResultsResponse;
    const sections = buildResultsSections(data, COLUMN_LABELS);
    expect(sections.map((s) => s.kind)).toEqual([
      'coupleScore',
      'complicityLevel',
      'individualScores',
      'titles',
      'conversationPrompts',
    ]);
    expect(sections[0]).toEqual({ kind: 'coupleScore', coupleScore: 20 });
  });
});

describe('buildResultsSections — masked content (the regression this task must pin)', () => {
  it('the individualScores section carries ONLY masked + message — no numeric keys at all', () => {
    const sections = buildResultsSections(maskedFixture(), COLUMN_LABELS);
    const scores = sections.find((s) => s.kind === 'individualScores');
    expect(scores).toEqual({
      kind: 'individualScores',
      masked: true,
      message: 'Match serré sur les valeurs, écart sur la connaissance.',
    });

    // Key-presence checks, not `toBeUndefined()` — a present-but-`undefined`
    // key would pass `toBeUndefined()` but must never happen here (see this
    // module's header comment on why that distinction matters).
    expect(scores).toBeDefined();
    expect('creatorScore' in (scores as object)).toBe(false);
    expect('partnerScore' in (scores as object)).toBe(false);
    expect(Object.keys(scores as object).sort()).toEqual(['kind', 'masked', 'message']);
  });

  it('no numeric score ever leaks into the serialized sections for a masked result, even via a stray fixture field', () => {
    // Regression fixture: a masked response body that ALSO happens to carry
    // stray numeric fields (defensive — this should never come from the
    // real route per its contract, but if it ever did, buildResultsSections
    // must still not surface them, because it only reads
    // `creatorTotalScore`/`partnerTotalScore` inside the `!isMaskedResults`
    // branch).
    const contaminated = {
      ...maskedFixture(),
      creatorTotalScore: 90,
      partnerTotalScore: 10,
      gapPercent: 88.9,
    } as unknown as GameResultsResponse;

    const serialized = JSON.stringify(buildResultsSections(contaminated, COLUMN_LABELS));
    expect(serialized).not.toContain('90');
    expect(serialized).not.toContain('"creatorScore"');
    expect(serialized).not.toContain('"partnerScore"');
    expect(serialized).not.toContain('88.9');
  });

  it('still renders coupleScore, complicityLevel, titles and prompts around the masked message, in the same fixed order', () => {
    const sections = buildResultsSections(maskedFixture(), COLUMN_LABELS);
    expect(sections[0]).toEqual({ kind: 'coupleScore', coupleScore: 20 });
    expect(sections[1]).toEqual({ kind: 'complicityLevel', label: 'Complices' });
    expect(sections[3]).toEqual({
      kind: 'titles',
      creatorLabel: 'Toi',
      creatorTitle: "Cœur d'Or",
      partnerLabel: 'Awa',
      partnerTitle: "Cœur d'Or",
    });
    expect(sections[4]).toEqual({
      kind: 'conversationPrompts',
      prompts: ['Q1?', 'Q2?', 'Q3?'],
    });
  });
});
