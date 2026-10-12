import { describe, it, expect } from 'vitest';
import {
  computeEffectiveElapsedMs,
  computeGameResult,
  CONVERSATION_PROMPTS,
  TIMER_MS,
  NETWORK_GRACE_MS,
  SPEED_BONUS_CAP_RATIO,
  GAP_MASK_THRESHOLD_PERCENT,
  type ScoredAnswer,
  type ComputeGameResultInput,
} from './scoring';

const CREATOR = 'creator';
const PARTNER = 'partner';

function own(
  questionId: string,
  roundType: ScoredAnswer['roundType'],
  userId: string,
  selectedOptionId: string | null,
  opts: Partial<Pick<ScoredAnswer, 'isSkipped' | 'effectiveElapsedMs' | 'optionWeight'>> = {},
): ScoredAnswer {
  return {
    questionId,
    roundType,
    userId,
    kind: 'OWN',
    selectedOptionId,
    isSkipped: opts.isSkipped ?? false,
    effectiveElapsedMs: opts.effectiveElapsedMs ?? TIMER_MS,
    ...(opts.optionWeight !== undefined ? { optionWeight: opts.optionWeight } : {}),
  };
}

function prediction(
  questionId: string,
  roundType: ScoredAnswer['roundType'],
  userId: string,
  selectedOptionId: string | null,
  opts: Partial<Pick<ScoredAnswer, 'isSkipped' | 'effectiveElapsedMs'>> = {},
): ScoredAnswer {
  return {
    questionId,
    roundType,
    userId,
    kind: 'PREDICTION',
    selectedOptionId,
    isSkipped: opts.isSkipped ?? false,
    effectiveElapsedMs: opts.effectiveElapsedMs ?? TIMER_MS,
  };
}

/**
 * `count` MIROIR questions. For question index i: creator's OWN is 'A',
 * partner's OWN is 'B'. Creator's PREDICTION matches partner's OWN ('B')
 * for the first `creatorMatches` questions (else 'Z'); partner's
 * PREDICTION matches creator's OWN ('A') for the first `partnerMatches`
 * questions (else 'Z').
 */
function buildMirrorAnswers(
  count: number,
  creatorMatches: number,
  partnerMatches: number,
): ScoredAnswer[] {
  const answers: ScoredAnswer[] = [];
  for (let i = 0; i < count; i++) {
    const qid = `mirror-${i}`;
    answers.push(own(qid, 'MIROIR', CREATOR, 'A'));
    answers.push(own(qid, 'MIROIR', PARTNER, 'B'));
    answers.push(prediction(qid, 'MIROIR', CREATOR, i < creatorMatches ? 'B' : 'Z'));
    answers.push(prediction(qid, 'MIROIR', PARTNER, i < partnerMatches ? 'A' : 'Z'));
  }
  return answers;
}

/** `count` FACEAFACE questions, first `matches` have creator/partner OWN equal. */
function buildFaceAFaceAnswers(count: number, matches: number): ScoredAnswer[] {
  const answers: ScoredAnswer[] = [];
  for (let i = 0; i < count; i++) {
    const qid = `face-${i}`;
    answers.push(own(qid, 'FACEAFACE', CREATOR, 'A'));
    answers.push(own(qid, 'FACEAFACE', PARTNER, i < matches ? 'A' : 'B'));
  }
  return answers;
}

function baseInput(
  answers: ScoredAnswer[],
  cumulativeCoupleScoreBeforeThisGame = 0,
): ComputeGameResultInput {
  return {
    creatorId: CREATOR,
    partnerId: PARTNER,
    cumulativeCoupleScoreBeforeThisGame,
    answers,
  };
}

describe('computeEffectiveElapsedMs', () => {
  it('uses the client value verbatim when within [serverElapsedMs - grace, ...]', () => {
    const result = computeEffectiveElapsedMs(20_000, 21_000);
    expect(result).toBe(20_000);
  });

  it('clamps a client value far below serverElapsedMs - grace UP to serverElapsedMs - grace (anti-cheat)', () => {
    const result = computeEffectiveElapsedMs(1_000, 30_000);
    expect(result).toBe(30_000 - NETWORK_GRACE_MS);
  });

  it('falls back to serverElapsedMs when clientElapsedMs is null', () => {
    const result = computeEffectiveElapsedMs(null, 15_000);
    expect(result).toBe(15_000);
  });

  it('never exceeds TIMER_MS', () => {
    const result = computeEffectiveElapsedMs(999_999, 999_999);
    expect(result).toBe(TIMER_MS);
  });

  it('never drops below 0', () => {
    const result = computeEffectiveElapsedMs(-5_000, 0);
    expect(result).toBe(0);
  });
});

describe('computeGameResult - mirrorPoints', () => {
  it('an all-correct-predictions MIROIR round yields mirrorPoints = 50 (5 x 10) for the predicting player', () => {
    const answers = buildMirrorAnswers(5, 0, 5); // partner predicts all 5 correctly
    const result = computeGameResult(baseInput(answers));
    expect(result.partnerMirrorPoints).toBe(50);
  });

  it('a skipped MIROIR prediction never matches, contributing 0', () => {
    const answers: ScoredAnswer[] = [
      own('q1', 'MIROIR', CREATOR, 'A'),
      prediction('q1', 'MIROIR', PARTNER, 'A', { isSkipped: true }),
    ];
    const result = computeGameResult(baseInput(answers));
    expect(result.partnerMirrorPoints).toBe(0);
  });
});

describe('computeGameResult - alignmentPointsShared', () => {
  it('a FACEAFACE round with 3/5 matching answers yields alignmentPointsShared = 30, shared into both raw scores, and coupleScore = 60', () => {
    const answers = buildFaceAFaceAnswers(5, 3);
    const result = computeGameResult(baseInput(answers));

    expect(result.alignmentPointsShared).toBe(30);
    expect(result.coupleScore).toBe(60);
    // No mirror/fidelity in this scenario, so both totals equal alignmentPointsShared exactly.
    expect(result.creatorTotalScore).toBe(30);
    expect(result.partnerTotalScore).toBe(30);
  });

  it('a skipped FACEAFACE answer never matches, contributing 0', () => {
    const answers: ScoredAnswer[] = [
      own('q1', 'FACEAFACE', CREATOR, 'A', { isSkipped: true }),
      own('q1', 'FACEAFACE', PARTNER, 'A'),
    ];
    const result = computeGameResult(baseInput(answers));
    expect(result.alignmentPointsShared).toBe(0);
  });
});

describe('computeGameResult - fidelityScore', () => {
  it('sums the chosen SCENARIO weights correctly per player', () => {
    const answers: ScoredAnswer[] = [
      own('s0', 'SCENARIO', CREATOR, 'A', { optionWeight: 3 }),
      own('s1', 'SCENARIO', CREATOR, 'A', { optionWeight: 5 }),
      own('s2', 'SCENARIO', CREATOR, 'A', { optionWeight: 2 }),
      own('s0', 'SCENARIO', PARTNER, 'A', { optionWeight: 4 }),
      own('s1', 'SCENARIO', PARTNER, 'A', { optionWeight: 1 }),
    ];
    const result = computeGameResult(baseInput(answers));

    expect(result.creatorFidelityScore).toBe(10);
    expect(result.partnerFidelityScore).toBe(5);
  });

  it('a skipped SCENARIO answer contributes 0 regardless of its optionWeight', () => {
    const answers: ScoredAnswer[] = [
      own('s0', 'SCENARIO', CREATOR, 'A', { optionWeight: 99, isSkipped: true }),
      own('s1', 'SCENARIO', CREATOR, 'A', { optionWeight: 7 }),
    ];
    const result = computeGameResult(baseInput(answers));
    expect(result.creatorFidelityScore).toBe(7);
  });

  it('never leaks a raw `weight` field anywhere on the returned object', () => {
    const answers: ScoredAnswer[] = [
      own('s0', 'SCENARIO', CREATOR, 'A', { optionWeight: 3 }),
      own('s0', 'SCENARIO', PARTNER, 'A', { optionWeight: 4 }),
    ];
    const result = computeGameResult(baseInput(answers));

    const keys = Object.keys(result);
    expect(keys.some((k) => k.toLowerCase().includes('weight'))).toBe(false);
    expect(keys.sort()).toEqual(
      [
        'alignmentPointsShared',
        'complicityLevel',
        'conversationPrompts',
        'coupleScore',
        'creatorFidelityScore',
        'creatorMirrorPoints',
        'creatorSpeedBonus',
        'creatorTitle',
        'creatorTotalScore',
        'gapMasked',
        'gapPercent',
        'partnerFidelityScore',
        'partnerMirrorPoints',
        'partnerSpeedBonus',
        'partnerTitle',
        'partnerTotalScore',
        'winnerRole',
      ].sort(),
    );
  });
});

describe('computeGameResult - speedBonus', () => {
  it('is capped at exactly 10% of rawScore when the raw sum would exceed it, and equals the raw sum when under the cap', () => {
    // 1 FACEAFACE match -> alignmentPointsShared = 10 -> rawScore = 10 (both players) -> cap = 1.
    const answers: ScoredAnswer[] = [
      own('face-0', 'FACEAFACE', CREATOR, 'A', { effectiveElapsedMs: 40_500 }), // ratio 0.1 -> 0.5 pts, under cap
      own('face-0', 'FACEAFACE', PARTNER, 'A', { effectiveElapsedMs: TIMER_MS }), // ratio 0 -> 0 pts from this row
      // 5 extra OWN answers for partner (different round) all fully fast -> raw sum 25, way over cap.
      own('mirror-a', 'MIROIR', PARTNER, 'A', { effectiveElapsedMs: 0 }),
      own('mirror-b', 'MIROIR', PARTNER, 'A', { effectiveElapsedMs: 0 }),
      own('mirror-c', 'MIROIR', PARTNER, 'A', { effectiveElapsedMs: 0 }),
      own('mirror-d', 'MIROIR', PARTNER, 'A', { effectiveElapsedMs: 0 }),
      own('mirror-e', 'MIROIR', PARTNER, 'A', { effectiveElapsedMs: 0 }),
    ];
    const result = computeGameResult(baseInput(answers));

    expect(result.alignmentPointsShared).toBe(10);
    expect(result.creatorTotalScore - result.creatorSpeedBonus).toBe(10); // creator rawScore = 10
    expect(result.partnerTotalScore - result.partnerSpeedBonus).toBe(10); // partner rawScore = 10

    // Under cap: creator's raw speed sum is 0.5, cap is 1 -> speedBonus = raw
    // sum = 0.5, rounded (Fix 1: scores must persist as Int) to 1.
    expect(result.creatorSpeedBonus).toBe(1);
    // Over cap: partner's raw speed sum is 25, cap is 1 -> speedBonus = cap = 1.
    expect(result.partnerSpeedBonus).toBe(1);
    expect(result.partnerSpeedBonus).toBe(SPEED_BONUS_CAP_RATIO * 10);
  });

  it('a skipped OWN answer contributes 0 to speedBonus', () => {
    const answers: ScoredAnswer[] = [
      own('face-0', 'FACEAFACE', CREATOR, 'A', { effectiveElapsedMs: 0, isSkipped: true }),
      own('face-0', 'FACEAFACE', PARTNER, 'A', { effectiveElapsedMs: 0, isSkipped: true }),
    ];
    const result = computeGameResult(baseInput(answers));
    expect(result.creatorSpeedBonus).toBe(0);
    expect(result.partnerSpeedBonus).toBe(0);
  });

  it('excludes PREDICTION rows from the speed bonus sum (only OWN rows count)', () => {
    // 10 MIROIR questions, creator predicts all 10 correctly -> creatorMirrorPoints
    // = 100 -> rawScore = 100 -> cap = 10, comfortably above the 5 pts a
    // wrongly-included fast PREDICTION row would contribute (so the cap can't
    // mask the bug this test is meant to catch).
    const answers = buildMirrorAnswers(10, 10, 0).map((a) =>
      a.questionId === 'mirror-0' && a.userId === CREATOR && a.kind === 'PREDICTION'
        ? { ...a, effectiveElapsedMs: 0 } // fast prediction submission
        : a,
    );
    const result = computeGameResult(baseInput(answers));

    expect(result.creatorMirrorPoints).toBe(100);
    // Every creator OWN row sits at the default TIMER_MS (0 speed pts each);
    // only the mirror-0 PREDICTION row is fast (0ms -> would-be 5 pts). A MIROIR
    // question's OWN and PREDICTION rows come from a single screen-visit timing
    // event, so PREDICTION rows must be excluded to avoid double-crediting it.
    // If they were wrongly included, this would be 5, not 0.
    expect(result.creatorSpeedBonus).toBe(0);
  });
});

describe('computeGameResult - gap masking', () => {
  it('gapMasked is false when the gap is exactly at the 40% threshold', () => {
    // creatorTotal = 100 (10 matches), partnerTotal = 60 (6 matches) -> gap = 40%.
    const answers = buildMirrorAnswers(10, 10, 6);
    const result = computeGameResult(baseInput(answers));

    expect(result.creatorTotalScore).toBe(100);
    expect(result.partnerTotalScore).toBe(60);
    expect(result.gapPercent).toBe(GAP_MASK_THRESHOLD_PERCENT);
    expect(result.gapMasked).toBe(false);
  });

  it('gapMasked is true when the gap exceeds the 40% threshold', () => {
    // creatorTotal = 100, partnerTotal = 50 -> gap = 50%.
    const answers = buildMirrorAnswers(10, 10, 5);
    const result = computeGameResult(baseInput(answers));

    expect(result.creatorTotalScore).toBe(100);
    expect(result.partnerTotalScore).toBe(50);
    expect(result.gapPercent).toBe(50);
    expect(result.gapMasked).toBe(true);
  });
});

describe('computeGameResult - winnerRole and titles', () => {
  it('equal totalScore -> winnerRole TIE, both titles "Coeur d\'Or"', () => {
    const answers = buildMirrorAnswers(5, 5, 5);
    const result = computeGameResult(baseInput(answers));

    expect(result.creatorTotalScore).toBe(result.partnerTotalScore);
    expect(result.winnerRole).toBe('TIE');
    expect(result.creatorTitle).toBe("Cœur d'Or");
    expect(result.partnerTitle).toBe("Cœur d'Or");
  });

  it('the higher scorer gets "Coeur d\'Or" and wins; the other gets "Coeur Sincere"', () => {
    const answers = buildMirrorAnswers(5, 5, 2);
    const result = computeGameResult(baseInput(answers));

    expect(result.creatorTotalScore).toBeGreaterThan(result.partnerTotalScore);
    expect(result.winnerRole).toBe('CREATOR');
    expect(result.creatorTitle).toBe("Cœur d'Or");
    expect(result.partnerTitle).toBe('Cœur Sincère');
  });
});

describe('computeGameResult - complicityLevel', () => {
  it.each([
    [99, 'DECOUVERTE'],
    [100, 'COMPLICES'],
    [299, 'COMPLICES'],
    [300, 'FUSIONNELS'],
    [599, 'FUSIONNELS'],
    [600, 'INSEPARABLES'],
  ])(
    'cumulativeCoupleScoreBeforeThisGame + coupleScore = %i -> %s',
    (cumulativeTotal, expectedLevel) => {
      // No FACEAFACE matches in this game -> coupleScore = 0, so the
      // cumulative-before value alone determines the new total.
      const result = computeGameResult(baseInput([], cumulativeTotal));
      expect(result.coupleScore).toBe(0);
      expect(result.complicityLevel).toBe(expectedLevel);
    },
  );

  it('resolves against cumulativeCoupleScoreBeforeThisGame + coupleScore, not cumulativeCoupleScoreBeforeThisGame alone', () => {
    // 1 FACEAFACE match -> alignmentPointsShared = 10 -> coupleScore = 20.
    const answers = buildFaceAFaceAnswers(1, 1);
    const result = computeGameResult(baseInput(answers, 80));

    expect(result.coupleScore).toBe(20);
    // 80 (before) + 20 (this game) = 100 -> COMPLICES. An implementation that
    // dropped "+ coupleScore" and used cumulativeCoupleScoreBeforeThisGame
    // alone would resolve 80 -> DECOUVERTE instead.
    expect(result.complicityLevel).toBe('COMPLICES');
  });
});

describe('computeGameResult - conversationPrompts', () => {
  it('always returns exactly 3 entries with no duplicates, drawn from CONVERSATION_PROMPTS', () => {
    for (let i = 0; i < 20; i++) {
      const result = computeGameResult(baseInput([]));
      expect(result.conversationPrompts).toHaveLength(3);
      expect(new Set(result.conversationPrompts).size).toBe(3);
      for (const prompt of result.conversationPrompts) {
        expect(CONVERSATION_PROMPTS).toContain(prompt);
      }
    }
  });
});

// Fix 1 (Critical, final whole-branch review) — creatorTotalScore /
// partnerTotalScore / creatorSpeedBonus / partnerSpeedBonus must always be
// integers before persistence (GameResult's columns are Prisma `Int`), and
// winnerRole/titles/gapPercent/gapMasked must be derived from the ROUNDED
// totals so the displayed winner can never disagree with the displayed
// scores.
describe('computeGameResult - integer rounding (Fix 1)', () => {
  it.each([
    ['mirror-only', buildMirrorAnswers(5, 3, 2)],
    ['faceaface-only', buildFaceAFaceAnswers(5, 3)],
    [
      'fidelity with an odd weight sum (fractional rawScore via x1.5)',
      [
        own('s0', 'SCENARIO', CREATOR, 'A', { optionWeight: 3 }),
        own('s1', 'SCENARIO', CREATOR, 'A', { optionWeight: 2 }),
        own('s0', 'SCENARIO', PARTNER, 'A', { optionWeight: 1 }),
      ],
    ],
    [
      'speed bonus under the cap (fractional pre-round speedBonus)',
      [
        own('face-0', 'FACEAFACE', CREATOR, 'A', { effectiveElapsedMs: 40_500 }),
        own('face-0', 'FACEAFACE', PARTNER, 'A', { effectiveElapsedMs: TIMER_MS }),
      ],
    ],
  ])('%s -> every score field is an integer', (_label, answers) => {
    const result = computeGameResult(baseInput(answers as ScoredAnswer[]));
    expect(Number.isInteger(result.creatorTotalScore)).toBe(true);
    expect(Number.isInteger(result.partnerTotalScore)).toBe(true);
    expect(Number.isInteger(result.creatorSpeedBonus)).toBe(true);
    expect(Number.isInteger(result.partnerSpeedBonus)).toBe(true);
  });

  it('rounds a fractional rawScore (odd fidelity sum) to the correct integer total', () => {
    // creatorFidelityScore = 3 -> rawScore = 3 * 1.5 = 4.5 -> rounds to 5.
    // partnerFidelityScore = 2 -> rawScore = 2 * 1.5 = 3.0 -> stays 3.
    // Neither player has any speed bonus (default effectiveElapsedMs = TIMER_MS).
    const answers: ScoredAnswer[] = [
      own('s0', 'SCENARIO', CREATOR, 'A', { optionWeight: 3 }),
      own('s0', 'SCENARIO', PARTNER, 'A', { optionWeight: 2 }),
    ];
    const result = computeGameResult(baseInput(answers));

    expect(result.creatorSpeedBonus).toBe(0);
    expect(result.partnerSpeedBonus).toBe(0);
    expect(result.creatorTotalScore).toBe(5);
    expect(result.partnerTotalScore).toBe(3);
    expect(result.winnerRole).toBe('CREATOR');
  });

  it('a near-tie whose UNROUNDED totals differ by < 1 resolves winnerRole from the ROUNDED totals, not the raw ones', () => {
    // Both players have fidelityScore = 1 -> rawScore = 1.5 each (a tie
    // before speed bonus). Creator additionally earns a small under-cap
    // speed bonus (raw speedBonus = 0.15, from a raw speed sum of 0.5
    // capped at 10% of 1.5), so the UNROUNDED totals are creator=1.65 vs
    // partner=1.5 -- creator ahead by 0.15 (< 1). A naive "compare
    // unrounded totals, round only for display" implementation would
    // report winnerRole=CREATOR while displaying tied 2-2 scores (since
    // both rawScore=1.5 rounds to 2, and creator's speedBonus 0.15 rounds
    // to 0). The correct behavior (round first, compare rounded) must
    // report a genuine TIE that agrees with the returned scores.
    const answers: ScoredAnswer[] = [
      own('s0', 'SCENARIO', CREATOR, 'A', { optionWeight: 1, effectiveElapsedMs: 40_500 }),
      own('s1', 'SCENARIO', PARTNER, 'A', { optionWeight: 1, effectiveElapsedMs: TIMER_MS }),
    ];
    const result = computeGameResult(baseInput(answers));

    expect(Number.isInteger(result.creatorTotalScore)).toBe(true);
    expect(Number.isInteger(result.partnerTotalScore)).toBe(true);
    expect(result.creatorTotalScore).toBe(2);
    expect(result.partnerTotalScore).toBe(2);
    // The critical assertion: winnerRole must agree with the returned
    // (rounded) totals, never with the unrounded intermediate values.
    expect(result.winnerRole).toBe('TIE');
    expect(
      result.creatorTotalScore === result.partnerTotalScore
        ? 'TIE'
        : result.creatorTotalScore > result.partnerTotalScore
          ? 'CREATOR'
          : 'PARTNER',
    ).toBe(result.winnerRole);
  });
});

// Fix 2 (Important, final whole-branch review) — a scored (non-skipped)
// SCENARIO OWN answer with no resolvable optionWeight must throw loudly
// rather than silently contribute 0, since a future caller that
// accidentally resolves weights from a client-shaped (stripped) payload
// would otherwise zero out every couple's fidelity score forever.
describe('computeGameResult - missing optionWeight guard (Fix 2)', () => {
  it('throws when a non-skipped SCENARIO OWN answer has optionWeight undefined', () => {
    const answers: ScoredAnswer[] = [own('s0', 'SCENARIO', CREATOR, 'A')];
    expect(() => computeGameResult(baseInput(answers))).toThrow(
      /Missing optionWeight for scored SCENARIO answer \(questionId: s0, userId: creator\)/,
    );
  });

  it('does NOT throw for a skipped SCENARIO OWN answer with no optionWeight', () => {
    const answers: ScoredAnswer[] = [own('s0', 'SCENARIO', CREATOR, null, { isSkipped: true })];
    expect(() => computeGameResult(baseInput(answers))).not.toThrow();
    const result = computeGameResult(baseInput(answers));
    expect(result.creatorFidelityScore).toBe(0);
  });
});
