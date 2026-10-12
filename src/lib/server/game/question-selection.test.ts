import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  selectQuestionsForRound,
  recordQuestionUsage,
  narrowToCategories,
} from './question-selection';

describe('selectQuestionsForRound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('picks count random questions from full active pool when couple has no QuestionUsage history', async () => {
    const questions = [
      { id: 'q1', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q2', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q3', category: 'DREAMS', roundType: 'MIROIR', active: true },
      { id: 'q4', category: 'DREAMS', roundType: 'MIROIR', active: true },
    ];

    prismaMock.question.findMany.mockResolvedValue(questions as never);
    prismaMock.questionUsage.findMany.mockResolvedValue([]);

    const result = await selectQuestionsForRound(prismaMock, {
      coupleId: 'couple-1',
      roundType: 'MIROIR',
      count: 2,
    });

    expect(result).toHaveLength(2);
    expect(result.every((r) => questions.some((q) => q.id === r.id))).toBe(true);
    expect(prismaMock.question.findMany).toHaveBeenCalledWith({
      where: { roundType: 'MIROIR', active: true },
      select: { id: true, category: true },
    });
  });

  it('excludes already-played questions when category is below 80% exhaustion', async () => {
    // INTIMACY has 5 questions; 80% = 4. Only 1 played -> not exhausted.
    const questions = [
      { id: 'q1', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q2', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q3', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q4', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q5', category: 'INTIMACY', roundType: 'MIROIR', active: true },
    ];

    const usages = [
      {
        questionId: 'q1',
        timesPlayed: 1,
        lastPlayedAt: new Date('2026-01-01'),
      },
    ];

    prismaMock.question.findMany.mockResolvedValue(questions as never);
    prismaMock.questionUsage.findMany.mockResolvedValue(usages as never);

    const result = await selectQuestionsForRound(prismaMock, {
      coupleId: 'couple-1',
      roundType: 'MIROIR',
      count: 2,
    });

    // Should only return from {q2, q3, q4, q5} (not q1)
    expect(result).toHaveLength(2);
    const resultIds = new Set(result.map((r) => r.id));
    expect(resultIds.has('q1')).toBe(false);
    expect([...resultIds].every((id) => questions.some((q) => q.id === id))).toBe(true);
  });

  it('makes category fully eligible again when >= 80% exhausted', async () => {
    // INTIMACY has 5 questions; 80% = 4. All 5 played -> exhausted.
    const questions = [
      { id: 'q1', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q2', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q3', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q4', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q5', category: 'INTIMACY', roundType: 'MIROIR', active: true },
    ];

    const usages = [
      { questionId: 'q1', timesPlayed: 2, lastPlayedAt: new Date('2026-01-01') },
      { questionId: 'q2', timesPlayed: 1, lastPlayedAt: new Date('2026-01-02') },
      { questionId: 'q3', timesPlayed: 1, lastPlayedAt: new Date('2026-01-03') },
      { questionId: 'q4', timesPlayed: 1, lastPlayedAt: new Date('2026-01-04') },
      { questionId: 'q5', timesPlayed: 1, lastPlayedAt: new Date('2026-01-05') },
    ];

    prismaMock.question.findMany.mockResolvedValue(questions as never);
    prismaMock.questionUsage.findMany.mockResolvedValue(usages as never);

    const result = await selectQuestionsForRound(prismaMock, {
      coupleId: 'couple-1',
      roundType: 'MIROIR',
      count: 2,
    });

    // Should now include previously-played questions
    expect(result).toHaveLength(2);
    expect(result.every((r) => questions.some((q) => q.id === r.id))).toBe(true);
  });

  it('always honors excludeQuestionIds even in exhausted category', async () => {
    // INTIMACY exhausted; but we exclude q1 and q2
    const questions = [
      { id: 'q1', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q2', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q3', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q4', category: 'INTIMACY', roundType: 'MIROIR', active: true },
    ];

    const usages = [
      { questionId: 'q1', timesPlayed: 1, lastPlayedAt: new Date('2026-01-01') },
      { questionId: 'q2', timesPlayed: 1, lastPlayedAt: new Date('2026-01-02') },
      { questionId: 'q3', timesPlayed: 1, lastPlayedAt: new Date('2026-01-03') },
      { questionId: 'q4', timesPlayed: 1, lastPlayedAt: new Date('2026-01-04') },
    ];

    prismaMock.question.findMany.mockResolvedValue(questions as never);
    prismaMock.questionUsage.findMany.mockResolvedValue(usages as never);

    const result = await selectQuestionsForRound(prismaMock, {
      coupleId: 'couple-1',
      roundType: 'MIROIR',
      count: 2,
      excludeQuestionIds: ['q1', 'q2'],
    });

    // Should only return from {q3, q4}
    expect(result).toHaveLength(2);
    const resultIds = new Set(result.map((r) => r.id));
    expect([...resultIds].every((id) => ['q3', 'q4'].includes(id))).toBe(true);
  });

  it('backfills with oldest lastPlayedAt from unexhausted categories when eligible pool < count', async () => {
    // DREAMS has 10 questions; 80% = 8. Only 5 played -> NOT exhausted.
    // Request 8: the 5 never-played fill eligible first, then backfill needs 3 more
    // from the 5 already-played questions. Verify they come in order of oldest lastPlayedAt.
    const questions = [
      { id: 'q1', category: 'DREAMS', roundType: 'MIROIR', active: true }, // played
      { id: 'q2', category: 'DREAMS', roundType: 'MIROIR', active: true }, // played
      { id: 'q3', category: 'DREAMS', roundType: 'MIROIR', active: true }, // played
      { id: 'q4', category: 'DREAMS', roundType: 'MIROIR', active: true }, // played
      { id: 'q5', category: 'DREAMS', roundType: 'MIROIR', active: true }, // played
      { id: 'q6', category: 'DREAMS', roundType: 'MIROIR', active: true }, // never-played
      { id: 'q7', category: 'DREAMS', roundType: 'MIROIR', active: true }, // never-played
      { id: 'q8', category: 'DREAMS', roundType: 'MIROIR', active: true }, // never-played
      { id: 'q9', category: 'DREAMS', roundType: 'MIROIR', active: true }, // never-played
      { id: 'q10', category: 'DREAMS', roundType: 'MIROIR', active: true }, // never-played
    ];

    const usages = [
      { questionId: 'q1', timesPlayed: 1, lastPlayedAt: new Date('2026-01-03') }, // middle
      { questionId: 'q2', timesPlayed: 1, lastPlayedAt: new Date('2026-01-01') }, // oldest
      { questionId: 'q3', timesPlayed: 1, lastPlayedAt: new Date('2026-01-05') }, // newest
      { questionId: 'q4', timesPlayed: 1, lastPlayedAt: new Date('2026-01-02') }, // second oldest
      { questionId: 'q5', timesPlayed: 1, lastPlayedAt: new Date('2026-01-04') }, // second newest
    ];

    prismaMock.question.findMany.mockResolvedValue(questions as never);
    prismaMock.questionUsage.findMany.mockResolvedValue(usages as never);

    const result = await selectQuestionsForRound(prismaMock, {
      coupleId: 'couple-1',
      roundType: 'MIROIR',
      count: 8,
    });

    // Should return 8: the 5 never-played (q6-q10) + 3 from the 5 already-played
    // The 3 backfilled must be the oldest ones: q2 (2026-01-01), q4 (2026-01-02), q1 (2026-01-03)
    expect(result).toHaveLength(8);
    const resultIds = result.map((r) => r.id);

    // The backfilled items (q1-q5) should appear, but NOT q3 or q5 (the newest ones)
    expect(resultIds.includes('q2')).toBe(true); // oldest
    expect(resultIds.includes('q4')).toBe(true); // second oldest
    expect(resultIds.includes('q1')).toBe(true); // third oldest
    expect(resultIds.includes('q3')).toBe(false); // newest, excluded
    expect(resultIds.includes('q5')).toBe(false); // second newest, excluded

    // All 5 never-played should be present
    expect(resultIds.includes('q6')).toBe(true);
    expect(resultIds.includes('q7')).toBe(true);
    expect(resultIds.includes('q8')).toBe(true);
    expect(resultIds.includes('q9')).toBe(true);
    expect(resultIds.includes('q10')).toBe(true);
  });

  it('backfills with oldest lastPlayedAt when eligible pool < count', async () => {
    // Only 2 questions available, but request 4
    const questions = [
      { id: 'q1', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q2', category: 'INTIMACY', roundType: 'MIROIR', active: true },
    ];

    const usages = [
      { questionId: 'q1', timesPlayed: 1, lastPlayedAt: new Date('2026-01-05') },
      { questionId: 'q2', timesPlayed: 1, lastPlayedAt: new Date('2026-01-01') },
    ];

    prismaMock.question.findMany.mockResolvedValue(questions as never);
    prismaMock.questionUsage.findMany.mockResolvedValue(usages as never);

    const result = await selectQuestionsForRound(prismaMock, {
      coupleId: 'couple-1',
      roundType: 'MIROIR',
      count: 4,
    });

    // Should return both, backfilled by oldest lastPlayedAt
    expect(result).toHaveLength(2);
    expect(result.every((r) => questions.some((q) => q.id === r.id))).toBe(true);
  });

  it('never throws when raw pool is smaller than count, returning all available', async () => {
    // Zero usage, 1 question available, request 5
    const questions = [{ id: 'q1', category: 'INTIMACY', roundType: 'MIROIR', active: true }];

    prismaMock.question.findMany.mockResolvedValue(questions as never);
    prismaMock.questionUsage.findMany.mockResolvedValue([]);

    const result = await selectQuestionsForRound(prismaMock, {
      coupleId: 'couple-1',
      roundType: 'MIROIR',
      count: 5,
    });

    // Should return the 1 question without error
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('q1');
  });

  it('within an exhausted category, prefers less-played questions over more-played ones (Fix 4, final whole-branch review)', async () => {
    // INTIMACY has 6 questions, all played -> exhausted (6 >= ceil(0.8*6)=5).
    // 3 have timesPlayed=1, 3 have timesPlayed=2. Requesting fewer than the
    // full category size must preferentially return the timesPlayed=1 tier.
    const questions = [
      { id: 'q1', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q2', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q3', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q4', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q5', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q6', category: 'INTIMACY', roundType: 'MIROIR', active: true },
    ];

    const usages = [
      { questionId: 'q1', timesPlayed: 1, lastPlayedAt: new Date('2026-01-01') },
      { questionId: 'q2', timesPlayed: 1, lastPlayedAt: new Date('2026-01-02') },
      { questionId: 'q3', timesPlayed: 1, lastPlayedAt: new Date('2026-01-03') },
      { questionId: 'q4', timesPlayed: 2, lastPlayedAt: new Date('2026-01-04') },
      { questionId: 'q5', timesPlayed: 2, lastPlayedAt: new Date('2026-01-05') },
      { questionId: 'q6', timesPlayed: 2, lastPlayedAt: new Date('2026-01-06') },
    ];

    prismaMock.question.findMany.mockResolvedValue(questions as never);
    prismaMock.questionUsage.findMany.mockResolvedValue(usages as never);

    const result = await selectQuestionsForRound(prismaMock, {
      coupleId: 'couple-1',
      roundType: 'MIROIR',
      count: 3,
    });

    expect(result).toHaveLength(3);
    const resultIds = new Set(result.map((r) => r.id));
    // All 3 must come from the timesPlayed=1 tier (q1-q3), none from the
    // timesPlayed=2 tier (q4-q6).
    expect(resultIds).toEqual(new Set(['q1', 'q2', 'q3']));
  });

  it('returns a valid selection of the requested count when every question in the category has no play history', async () => {
    const questions = [
      { id: 'q1', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q2', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q3', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q4', category: 'INTIMACY', roundType: 'MIROIR', active: true },
    ];

    prismaMock.question.findMany.mockResolvedValue(questions as never);
    prismaMock.questionUsage.findMany.mockResolvedValue([]);

    const result = await selectQuestionsForRound(prismaMock, {
      coupleId: 'couple-1',
      roundType: 'MIROIR',
      count: 3,
    });

    // All questions sit in the same (timesPlayed=0) tier -- order among
    // them is not guaranteed, but the count and membership must be correct.
    expect(result).toHaveLength(3);
    const resultIds = new Set(result.map((r) => r.id));
    expect(resultIds.size).toBe(3);
    expect([...resultIds].every((id) => questions.some((q) => q.id === id))).toBe(true);
  });

  it('only returns active questions of the requested roundType', async () => {
    const questions = [
      { id: 'q1', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q2', category: 'INTIMACY', roundType: 'MIROIR', active: true },
      { id: 'q3', category: 'DREAMS', roundType: 'SCENARIO', active: true }, // different type
      { id: 'q4', category: 'DREAMS', roundType: 'SCENARIO', active: false }, // inactive
    ];

    prismaMock.question.findMany.mockResolvedValue(
      questions.filter((q) => q.roundType === 'MIROIR' && q.active) as never,
    );
    prismaMock.questionUsage.findMany.mockResolvedValue([]);

    const result = await selectQuestionsForRound(prismaMock, {
      coupleId: 'couple-1',
      roundType: 'MIROIR',
      count: 2,
    });

    // Should only consider MIROIR questions
    expect(result.every((r) => ['q1', 'q2'].includes(r.id))).toBe(true);
    expect(prismaMock.question.findMany).toHaveBeenCalledWith({
      where: { roundType: 'MIROIR', active: true },
      select: { id: true, category: true },
    });
  });
});

describe('recordQuestionUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockBulkOk(): void {
    prismaMock.questionUsage.updateMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.questionUsage.createMany.mockResolvedValue({ count: 0 } as never);
  }

  it('creates new QuestionUsage rows on first play', async () => {
    mockBulkOk();

    await recordQuestionUsage(prismaMock, 'couple-1', ['q1', 'q2']);

    expect(prismaMock.questionUsage.createMany).toHaveBeenCalledWith({
      data: [
        {
          coupleId: 'couple-1',
          questionId: 'q1',
          timesPlayed: 1,
          lastPlayedAt: expect.any(Date),
        },
        {
          coupleId: 'couple-1',
          questionId: 'q2',
          timesPlayed: 1,
          lastPlayedAt: expect.any(Date),
        },
      ],
      // Without this, a replay of an already-played question aborts the whole
      // session-creation transaction on the unique (coupleId, questionId).
      skipDuplicates: true,
    });
  });

  it('increments timesPlayed on replay', async () => {
    mockBulkOk();

    await recordQuestionUsage(prismaMock, 'couple-1', ['q1']);

    expect(prismaMock.questionUsage.updateMany).toHaveBeenCalledWith({
      where: { coupleId: 'couple-1', questionId: { in: ['q1'] } },
      data: { timesPlayed: { increment: 1 }, lastPlayedAt: expect.any(Date) },
    });
  });

  it('bumps existing rows BEFORE inserting missing ones', async () => {
    // Order is the correctness boundary, not an implementation detail:
    // insert-then-bump would push a first play straight to timesPlayed=2,
    // which skews the anti-repetition tiering for the rest of the couple's
    // history.
    const calls: string[] = [];
    prismaMock.questionUsage.updateMany.mockImplementation((() => {
      calls.push('updateMany');
      return Promise.resolve({ count: 1 });
    }) as never);
    prismaMock.questionUsage.createMany.mockImplementation((() => {
      calls.push('createMany');
      return Promise.resolve({ count: 1 });
    }) as never);

    await recordQuestionUsage(prismaMock, 'couple-1', ['q1', 'q2']);

    expect(calls).toEqual(['updateMany', 'createMany']);
  });

  it('issues a fixed number of statements regardless of how many questions are drawn', async () => {
    // The regression this guards: one statement per question inside the
    // session-creation transaction exceeded Prisma's interactive-transaction
    // timeout against a remote Postgres, 500ing "Nouvelle partie". A full
    // session draws 15 questions and must still cost exactly 2 round-trips.
    mockBulkOk();

    const fifteen = Array.from({ length: 15 }, (_, i) => `q${i}`);
    await recordQuestionUsage(prismaMock, 'couple-1', fifteen);

    expect(prismaMock.questionUsage.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.questionUsage.createMany).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when no questions are drawn', async () => {
    mockBulkOk();

    await recordQuestionUsage(prismaMock, 'couple-1', []);

    expect(prismaMock.questionUsage.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.questionUsage.createMany).not.toHaveBeenCalled();
  });

  it('counts a repeated id once', async () => {
    mockBulkOk();

    await recordQuestionUsage(prismaMock, 'couple-1', ['q1', 'q1']);

    expect(prismaMock.questionUsage.updateMany).toHaveBeenCalledWith({
      where: { coupleId: 'couple-1', questionId: { in: ['q1'] } },
      data: { timesPlayed: { increment: 1 }, lastPlayedAt: expect.any(Date) },
    });
  });
});

describe('narrowToCategories (theme selection)', () => {
  const q = (id: string, category: string) => ({ id, category });
  const bank = [
    q('a1', 'Confiance'),
    q('a2', 'Confiance'),
    q('a3', 'Confiance'),
    q('a4', 'Confiance'),
    q('a5', 'Confiance'),
    q('b1', 'Réseaux'),
    q('b2', 'Réseaux'),
  ];

  it('leaves the pool untouched when no theme was chosen', () => {
    for (const none of [undefined, []]) {
      const { pool, narrowed } = narrowToCategories(bank, none, 5);
      expect(pool).toBe(bank);
      expect(narrowed).toBe(false);
    }
  });

  it('narrows to the chosen theme when it can fill the round', () => {
    const { pool, narrowed } = narrowToCategories(bank, ['Confiance'], 5);
    expect(narrowed).toBe(true);
    expect(pool.map((x) => x.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
  });

  it('WIDENS back to the full pool when the chosen theme cannot fill the round', () => {
    // The rule the whole function exists for. "Réseaux" has 2 questions and
    // the round needs 5; narrowing would leave the round three short, which
    // is a broken game rather than a smaller one.
    const { pool, narrowed } = narrowToCategories(bank, ['Réseaux'], 5);
    expect(narrowed).toBe(false);
    expect(pool).toBe(bank);
  });

  it('widens when NONE of the chosen themes exist for this round type', () => {
    // Routine, not exotic: the bank's categories are scoped per round type,
    // so a couple choosing two SCENARIO themes has chosen nothing that
    // exists for MIROIR.
    const { pool, narrowed } = narrowToCategories(bank, ['Argent', 'Ex et passé'], 5);
    expect(narrowed).toBe(false);
    expect(pool).toBe(bank);
  });

  it('combines themes to reach the count', () => {
    const { pool, narrowed } = narrowToCategories(bank, ['Réseaux', 'Confiance'], 7);
    expect(narrowed).toBe(true);
    expect(pool).toHaveLength(7);
  });

  it('counts EXCLUDED questions as unavailable when deciding to narrow', () => {
    // Excluded ids are already drawn for another round of the same game.
    // Counting them as available would narrow to a pool that then cannot
    // fill — the exact failure the widening rule exists to prevent, arrived
    // at one step later.
    const excluded = new Set(['a1', 'a2', 'a3']);
    const { narrowed } = narrowToCategories(bank, ['Confiance'], 5, excluded);
    expect(narrowed).toBe(false);
  });

  it('narrows when the exclusions still leave enough', () => {
    const { pool, narrowed } = narrowToCategories(bank, ['Confiance'], 3, new Set(['a1']));
    expect(narrowed).toBe(true);
    expect(pool).toHaveLength(5);
  });

  it('ignores an unknown theme rather than emptying the pool', () => {
    const { pool, narrowed } = narrowToCategories(bank, ['Confiance', 'Inexistant'], 5);
    expect(narrowed).toBe(true);
    expect(pool.every((x) => x.category === 'Confiance')).toBe(true);
  });
});
