import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma, type PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

vi.mock('@/lib/server/couples/queries', () => ({
  findActivatedCoupleForUser: vi.fn(),
}));

vi.mock('@/lib/server/game/session-helpers', () => ({
  loadOwnedGameSession: vi.fn(),
}));

import { POST } from './route';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { loadOwnedGameSession } from '@/lib/server/game/session-helpers';
import { prisma } from '@/lib/server/prisma';

// A distinct mock from prismaMock so the "all in one transaction" tests can
// actually fail: the route's $transaction callback receives this object as
// `tx`, so a write issued on the bare `prisma` client instead of `tx` shows
// up as a call on prismaMock rather than txMock and is caught by the
// not-called assertions below (Design Decision — see review finding I-2).
const txMock: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/games/session-1/round/advance', { method: 'POST' });
}

function makeCtx(id = 'session-1'): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// cumulativeCoupleScore 100 (before this game) is load-bearing for the
// hand-computed complicityLevel below.
const ACTIVATED_COUPLE = {
  id: 'couple-1',
  creatorId: 'user-1',
  partnerId: 'user-2' as string | null,
  disclaimerAcceptedByCreatorAt: new Date('2026-09-01T00:00:00.000Z'),
  disclaimerAcceptedByPartnerAt: new Date('2026-09-01T00:00:00.000Z'),
  cumulativeCoupleScore: 100,
};

const BASE_SESSION = {
  id: 'session-1',
  coupleId: 'couple-1',
  status: 'IN_PROGRESS',
  currentRoundNumber: 1,
  currentQuestionNumber: 5,
  phase: 'ROUND_REVEAL',
  activePlayerRole: 'PARTNER',
  currentQuestionShownAt: null as Date | null,
  jokersRemainingCreator: 2,
  jokersRemainingPartner: 2,
  startedAt: new Date('2026-09-01T00:00:00.000Z'),
  completedAt: null,
};

// ── The fixed answer set the final-round expectation is hand-computed from ──
//
// Every answer uses effectiveElapsedMs = 22_500 = TIMER_MS / 2, so each
// non-skipped OWN answer contributes 5 * 0.5 = 2.5 raw speed points.
const HALF_TIMER_MS = 22_500;

function answerRow(over: {
  userId: string;
  kind: string;
  selectedOptionId: string | null;
  roundType: string;
  questionId: string;
  options: unknown;
  isSkipped?: boolean;
}) {
  return {
    userId: over.userId,
    kind: over.kind,
    selectedOptionId: over.selectedOptionId,
    isSkipped: over.isSkipped ?? false,
    effectiveElapsedMs: HALF_TIMER_MS,
    gameRoundQuestion: {
      gameRound: { type: over.roundType },
      question: { id: over.questionId, options: over.options },
    },
  };
}

const MIROIR_OPTIONS = [
  { id: 'a', text: 'A' },
  { id: 'b', text: 'B' },
];
const SCENARIO_OPTIONS = [
  { id: 'w1', text: 'W1', weight: 10 },
  { id: 'w2', text: 'W2', weight: 20 },
];
const FACE_OPTIONS = [
  { id: 'x', text: 'X' },
  { id: 'y', text: 'Y' },
];

function fixedAnswerRows() {
  return [
    // MIROIR q-m1: each player predicts the other's pick correctly.
    answerRow({
      userId: 'user-1',
      kind: 'OWN',
      selectedOptionId: 'a',
      roundType: 'MIROIR',
      questionId: 'q-m1',
      options: MIROIR_OPTIONS,
    }),
    answerRow({
      userId: 'user-1',
      kind: 'PREDICTION',
      selectedOptionId: 'b',
      roundType: 'MIROIR',
      questionId: 'q-m1',
      options: MIROIR_OPTIONS,
    }),
    answerRow({
      userId: 'user-2',
      kind: 'OWN',
      selectedOptionId: 'b',
      roundType: 'MIROIR',
      questionId: 'q-m1',
      options: MIROIR_OPTIONS,
    }),
    answerRow({
      userId: 'user-2',
      kind: 'PREDICTION',
      selectedOptionId: 'a',
      roundType: 'MIROIR',
      questionId: 'q-m1',
      options: MIROIR_OPTIONS,
    }),
    // SCENARIO q-s1: creator picks weight 20, partner picks weight 10.
    answerRow({
      userId: 'user-1',
      kind: 'OWN',
      selectedOptionId: 'w2',
      roundType: 'SCENARIO',
      questionId: 'q-s1',
      options: SCENARIO_OPTIONS,
    }),
    answerRow({
      userId: 'user-2',
      kind: 'OWN',
      selectedOptionId: 'w1',
      roundType: 'SCENARIO',
      questionId: 'q-s1',
      options: SCENARIO_OPTIONS,
    }),
    // FACEAFACE q-f1: both pick 'x' -> one alignment match.
    answerRow({
      userId: 'user-1',
      kind: 'OWN',
      selectedOptionId: 'x',
      roundType: 'FACEAFACE',
      questionId: 'q-f1',
      options: FACE_OPTIONS,
    }),
    answerRow({
      userId: 'user-2',
      kind: 'OWN',
      selectedOptionId: 'x',
      roundType: 'FACEAFACE',
      questionId: 'q-f1',
      options: FACE_OPTIONS,
    }),
  ];
}

// Hand-computed from the answer set above (see scoring.ts constants):
//   creatorMirrorPoints  = 10  (1 correct MIROIR prediction x 10)
//   partnerMirrorPoints  = 10
//   creatorFidelityScore = 20  (weight of 'w2')
//   partnerFidelityScore = 10  (weight of 'w1')
//   alignment            = 10  (1 FACEAFACE match x 10)
//   creatorRawScore = 10*1.0 + 20*1.5 + 10*1.0 = 50
//   partnerRawScore = 10*1.0 + 10*1.5 + 10*1.0 = 35
//   rawSpeedSum (3 OWN answers each) = 3 * 2.5 = 7.5 for both players
//   creatorSpeedBonus = round(min(7.5, 0.1*50 = 5.0))  = 5
//   partnerSpeedBonus = round(min(7.5, 0.1*35 = 3.5))  = 4
//   creatorTotalScore = 50 + 5 = 55 ; partnerTotalScore = 35 + 4 = 39
//   coupleScore  = alignment * 2 = 20
//   gapPercent   = |55-39| / 55 * 100 = 29.0909...  -> not > 40 -> gapMasked false
//   winnerRole   = CREATOR (55 > 39)
//   complicityLevel = level(100 before + 20) = level(120) = COMPLICES
const EXPECTED = {
  coupleScore: 20,
  complicityLevel: 'COMPLICES',
  creatorTotalScore: 55,
  partnerTotalScore: 39,
  creatorMirrorPoints: 10,
  partnerMirrorPoints: 10,
  creatorFidelityScore: 20,
  partnerFidelityScore: 10,
  alignmentPointsShared: 10,
  creatorSpeedBonus: 5,
  partnerSpeedBonus: 4,
  gapMasked: false,
  winnerRole: 'CREATOR',
};

const FINAL_ROUND_SESSION = {
  ...BASE_SESSION,
  currentRoundNumber: 3,
  activePlayerRole: 'CREATOR',
};

beforeEach(() => {
  vi.clearAllMocks();
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
  (findActivatedCoupleForUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    ...ACTIVATED_COUPLE,
  });
  (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_SESSION);

  mockReset(txMock);
  // The route's only write path for the final-round branch is
  // `prisma.$transaction(async (tx) => { ... })` — hand the callback a
  // client distinct from prismaMock so a write that leaks outside the
  // transaction is observable (review finding I-2).
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof txMock) => unknown)(txMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
  txMock.answer.findMany.mockResolvedValue(fixedAnswerRows() as never);
  txMock.gameResult.create.mockResolvedValue({} as never);
  txMock.couple.update.mockResolvedValue({} as never);
  txMock.gameSession.update.mockResolvedValue({} as never);
  // Only the non-final branch writes via the bare `prisma` client.
  prismaMock.gameSession.update.mockResolvedValue({} as never);
  prismaMock.gameRound.update.mockResolvedValue({} as never);
});

describe('POST /api/games/:id/round/advance', () => {
  it('returns 404 NO_ACTIVE_COUPLE when the user has no active couple', async () => {
    (findActivatedCoupleForUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NO_ACTIVE_COUPLE');
    expect(loadOwnedGameSession).not.toHaveBeenCalled();
  });

  it('returns 404 NO_ACTIVE_GAME when loadOwnedGameSession returns null (not found or not owned)', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NO_ACTIVE_GAME');
  });

  it('returns 409 NOT_IN_ROUND_REVEAL when phase is not ROUND_REVEAL, writing nothing', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SESSION,
      phase: 'ANSWERING',
    });

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('NOT_IN_ROUND_REVEAL');
    expect(prismaMock.gameSession.update).not.toHaveBeenCalled();
    expect(prismaMock.gameResult.create).not.toHaveBeenCalled();
    expect(prismaMock.couple.update).not.toHaveBeenCalled();
  });

  it('round 1 -> 2: persists ROUND_INTRO with question 1 and PARTNER as the round-2 starter', async () => {
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);

    // Design Decision 5's only enforcement point: the couple scope must
    // reach loadOwnedGameSession unchanged. An argument transposition or a
    // dropped couple.id here would let one couple advance another couple's
    // game with the rest of this suite still green (review finding I-1).
    expect(findActivatedCoupleForUser).toHaveBeenCalledWith(prisma, 'user-1');
    expect(loadOwnedGameSession).toHaveBeenCalledWith(prisma, 'couple-1', 'session-1');

    expect(prismaMock.gameSession.update).toHaveBeenCalledTimes(1);
    const call = prismaMock.gameSession.update.mock.calls[0]?.[0];
    expect(call?.where).toEqual({ id: 'session-1' });
    expect(call?.data).toMatchObject({
      phase: 'ROUND_INTRO',
      currentRoundNumber: 2,
      currentQuestionNumber: 1,
      activePlayerRole: 'PARTNER',
    });

    expect(await res.json()).toEqual({
      phase: 'ROUND_INTRO',
      currentRoundNumber: 2,
      activePlayerRole: 'PARTNER',
      gameCompleted: false,
    });
  });

  it('round 2 -> 3: persists ROUND_INTRO with CREATOR as the round-3 starter', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SESSION,
      currentRoundNumber: 2,
      activePlayerRole: 'PARTNER',
    });

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);

    const call = prismaMock.gameSession.update.mock.calls[0]?.[0];
    expect(call?.data).toMatchObject({
      phase: 'ROUND_INTRO',
      currentRoundNumber: 3,
      currentQuestionNumber: 1,
      activePlayerRole: 'CREATOR',
    });

    expect(await res.json()).toEqual({
      phase: 'ROUND_INTRO',
      currentRoundNumber: 3,
      activePlayerRole: 'CREATOR',
      gameCompleted: false,
    });
  });

  it('non-final advance leaves the next GameRound PENDING (start-turn owns the IN_PROGRESS flip, Design Decision 2)', async () => {
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    expect(prismaMock.gameRound.update).not.toHaveBeenCalled();
    expect(prismaMock.gameResult.create).not.toHaveBeenCalled();
    expect(prismaMock.couple.update).not.toHaveBeenCalled();
  });

  it('round 3: persists a GameResult matching the hand-computed expectation for the fixed answer set', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      FINAL_ROUND_SESSION,
    );

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);

    expect(txMock.gameResult.create).toHaveBeenCalledTimes(1);
    const data = txMock.gameResult.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data).toMatchObject({ gameSessionId: 'session-1', ...EXPECTED });
    expect(data.gapPercent).toBeCloseTo((16 / 55) * 100, 6);
    expect(Array.isArray(data.conversationPrompts)).toBe(true);
    expect((data.conversationPrompts as string[]).length).toBe(3);

    // creatorTitle/partnerTitle are derived from winnerRole at read time —
    // the GameResult model has no columns for them.
    expect(data.creatorTitle).toBeUndefined();
    expect(data.partnerTitle).toBeUndefined();
  });

  it('round 3: banks coupleScore onto the couple and closes the session, all in one transaction', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      FINAL_ROUND_SESSION,
    );

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    expect(txMock.couple.update).toHaveBeenCalledTimes(1);
    const coupleCall = txMock.couple.update.mock.calls[0]?.[0];
    expect(coupleCall?.where).toEqual({ id: 'couple-1' });
    expect(coupleCall?.data).toEqual({ cumulativeCoupleScore: { increment: 20 } });

    expect(txMock.gameSession.update).toHaveBeenCalledTimes(1);
    const sessionCall = txMock.gameSession.update.mock.calls[0]?.[0];
    expect(sessionCall?.where).toEqual({ id: 'session-1' });
    expect(sessionCall?.data).toMatchObject({ status: 'COMPLETED', phase: 'COMPLETE' });
    expect((sessionCall?.data as { completedAt: Date }).completedAt).toBeInstanceOf(Date);

    // The writes must land on the transaction client, never on the bare
    // `prisma` client — a write that "escaped" the transaction (e.g. the
    // cumulativeCoupleScore increment moved outside the callback) would
    // show up here instead, and this is what makes that regression
    // observable (review finding I-2).
    expect(prismaMock.couple.update).not.toHaveBeenCalled();
    expect(prismaMock.gameResult.create).not.toHaveBeenCalled();
    expect(prismaMock.gameSession.update).not.toHaveBeenCalled();

    expect(await res.json()).toEqual({ phase: 'COMPLETE', gameCompleted: true });
  });

  it('round 3: the response never leaks raw option weights or per-answer detail', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      FINAL_ROUND_SESSION,
    );

    const res = await POST(makeReq(), makeCtx());
    const raw = await res.text();
    expect(raw).not.toContain('weight');
    expect(raw).not.toContain('w2');
    expect(JSON.parse(raw)).toEqual({ phase: 'COMPLETE', gameCompleted: true });
  });

  it('round 3: a SCENARIO OWN answer whose option carries no weight throws (500) and persists nothing', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      FINAL_ROUND_SESSION,
    );
    txMock.answer.findMany.mockResolvedValue([
      answerRow({
        userId: 'user-1',
        kind: 'OWN',
        selectedOptionId: 'w1',
        roundType: 'SCENARIO',
        questionId: 'q-s1',
        // 'w1' exists but has no weight — a data-integrity violation.
        options: [{ id: 'w1', text: 'W1' }],
      }),
    ] as never);

    await expect(POST(makeReq(), makeCtx())).rejects.toThrow(/cannot resolve option weight/);
    expect(txMock.gameResult.create).not.toHaveBeenCalled();
    expect(txMock.couple.update).not.toHaveBeenCalled();
  });

  it('round 3: a SCENARIO OWN answer whose selectedOptionId is absent from options throws (500)', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      FINAL_ROUND_SESSION,
    );
    txMock.answer.findMany.mockResolvedValue([
      answerRow({
        userId: 'user-1',
        kind: 'OWN',
        selectedOptionId: 'ghost',
        roundType: 'SCENARIO',
        questionId: 'q-s1',
        options: SCENARIO_OPTIONS,
      }),
    ] as never);

    await expect(POST(makeReq(), makeCtx())).rejects.toThrow(/cannot resolve option weight/);
    expect(txMock.gameResult.create).not.toHaveBeenCalled();
  });

  it('round 3: a SKIPPED SCENARIO OWN answer needs no weight and scores 0 fidelity', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      FINAL_ROUND_SESSION,
    );
    txMock.answer.findMany.mockResolvedValue([
      answerRow({
        userId: 'user-1',
        kind: 'OWN',
        selectedOptionId: null,
        isSkipped: true,
        roundType: 'SCENARIO',
        questionId: 'q-s1',
        options: SCENARIO_OPTIONS,
      }),
    ] as never);

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const data = txMock.gameResult.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.creatorFidelityScore).toBe(0);
    expect(data.partnerFidelityScore).toBe(0);
  });

  it('round 3: throws when the couple somehow has no partnerId', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      FINAL_ROUND_SESSION,
    );
    (findActivatedCoupleForUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...ACTIVATED_COUPLE,
      partnerId: null,
    });

    await expect(POST(makeReq(), makeCtx())).rejects.toThrow(/has no partnerId/);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('round 3: a racing duplicate completion (P2002 on GameResult) is idempotent — 200, no double-banking', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      FINAL_ROUND_SESSION,
    );
    // Let the $transaction callback actually run (the default
    // mockImplementation from beforeEach invokes it with txMock), and
    // reject at the point a real race would: the unique-constrained
    // `gameResult.create` insert. Because the route awaits that call
    // before touching `couple`, the rejection propagates out of the
    // callback exactly as a real Prisma transaction would roll back —
    // `couple.update` is never reached (review finding I-3).
    txMock.gameResult.create.mockRejectedValueOnce(p2002(['gameSessionId']));

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ phase: 'COMPLETE', gameCompleted: true });
    // The whole transaction rolled back, so the losing request must not
    // issue a second increment of its own — on the transaction client or
    // (were the code to bypass the tx entirely) the bare prisma client.
    expect(txMock.couple.update).not.toHaveBeenCalled();
    expect(prismaMock.couple.update).not.toHaveBeenCalled();
  });

  it('round 3: rethrows a non-P2002 transaction error', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      FINAL_ROUND_SESSION,
    );
    prismaMock.$transaction.mockRejectedValueOnce(new Error('boom'));

    await expect(POST(makeReq(), makeCtx())).rejects.toThrow('boom');
  });

  it('returns 401 when unauthenticated', async () => {
    const { NextResponse } = await import('next/server');
    (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(401);
    expect(findActivatedCoupleForUser).not.toHaveBeenCalled();
  });

  it('returns 403 when CSRF verification fails, before auth runs', async () => {
    const { NextResponse } = await import('next/server');
    (verifyCsrf as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(403);
    expect(requireAuth).not.toHaveBeenCalled();
    expect(findActivatedCoupleForUser).not.toHaveBeenCalled();
  });

  it("source exports runtime = 'nodejs'", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('withRequestContext');
  });
});
