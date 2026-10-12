import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
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
  countQuestionsInRound: vi.fn(),
}));

import { POST } from './route';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { loadOwnedGameSession, countQuestionsInRound } from '@/lib/server/game/session-helpers';

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/games/session-1/answers', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function makeCtx(id = 'session-1'): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const ACTIVATED_COUPLE = {
  id: 'couple-1',
  creatorId: 'user-1',
  partnerId: 'user-2',
  disclaimerAcceptedByCreatorAt: new Date('2026-09-01T00:00:00.000Z'),
  disclaimerAcceptedByPartnerAt: new Date('2026-09-01T00:00:00.000Z'),
  cumulativeCoupleScore: 0,
};

const SHOWN_AT = new Date('2026-09-03T10:00:00.000Z');

const BASE_SESSION = {
  id: 'session-1',
  coupleId: 'couple-1',
  status: 'IN_PROGRESS',
  currentRoundNumber: 1,
  currentQuestionNumber: 1,
  phase: 'ANSWERING',
  activePlayerRole: 'CREATOR',
  currentQuestionShownAt: SHOWN_AT as Date | null,
  jokersRemainingCreator: 2,
  jokersRemainingPartner: 2,
  startedAt: new Date('2026-09-01T00:00:00.000Z'),
  completedAt: null,
};

const MIROIR_QUESTION = {
  id: 'q-1',
  roundType: 'MIROIR',
  prompt: 'Question miroir ?',
  options: [
    { id: 'opt-a', text: 'Option A' },
    { id: 'opt-b', text: 'Option B' },
  ],
};

const SCENARIO_QUESTION = {
  id: 'q-2',
  roundType: 'SCENARIO',
  prompt: 'Question scenario ?',
  options: [
    { id: 'opt-a', text: 'Option A', weight: 5 },
    { id: 'opt-b', text: 'Option B', weight: 10 },
  ],
};

function mockRoundAndQuestion(
  roundType: string,
  question: typeof MIROIR_QUESTION | typeof SCENARIO_QUESTION,
): void {
  prismaMock.gameRound.findFirst.mockResolvedValue({
    id: 'round-1',
    type: roundType,
  } as never);
  prismaMock.gameRoundQuestion.findFirst.mockResolvedValue({
    id: 'grq-1',
    question,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Rounds are five questions unless a test says otherwise — the Standard
  // format, which is what every existing case here was written against.
  (countQuestionsInRound as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(5);
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
  (findActivatedCoupleForUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    ACTIVATED_COUPLE,
  );
  (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_SESSION);
  mockRoundAndQuestion('MIROIR', MIROIR_QUESTION);

  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
  prismaMock.answer.createMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.answer.count.mockResolvedValue(1 as never);
  prismaMock.gameSession.update.mockResolvedValue({} as never);
  prismaMock.gameRound.update.mockResolvedValue({} as never);
});

describe('POST /api/games/:id/answers', () => {
  it('returns 404 NO_ACTIVE_COUPLE when the user has no active couple', async () => {
    (findActivatedCoupleForUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(makeReq({}), makeCtx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NO_ACTIVE_COUPLE');
    expect(loadOwnedGameSession).not.toHaveBeenCalled();
  });

  it('returns 404 NO_ACTIVE_GAME when loadOwnedGameSession returns null (not found or not owned)', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(makeReq({}), makeCtx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NO_ACTIVE_GAME');
  });

  it('returns 409 NOT_ANSWERING_PHASE when phase is not ANSWERING', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SESSION,
      phase: 'PASS_DEVICE',
    });

    const res = await POST(
      makeReq({ ownOptionId: 'opt-a', predictionOptionId: 'opt-b' }),
      makeCtx(),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('NOT_ANSWERING_PHASE');
    expect(prismaMock.answer.createMany).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_FAILED when MIROIR body does not match the expected shape', async () => {
    const res = await POST(makeReq({ optionId: 'opt-a' }), makeCtx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.answer.createMany).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_FAILED when SCENARIO/FACEAFACE body does not match the expected shape', async () => {
    mockRoundAndQuestion('SCENARIO', SCENARIO_QUESTION);

    const res = await POST(
      makeReq({ ownOptionId: 'opt-a', predictionOptionId: 'opt-b' }),
      makeCtx(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('returns 400 INVALID_OPTION when a submitted option id does not exist on the question', async () => {
    const res = await POST(
      makeReq({ ownOptionId: 'opt-zzz', predictionOptionId: 'opt-b' }),
      makeCtx(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_OPTION');
    expect(prismaMock.answer.createMany).not.toHaveBeenCalled();
  });

  it('MIROIR happy path inserts 2 rows (OWN + PREDICTION) with the same effectiveElapsedMs', async () => {
    prismaMock.answer.count.mockResolvedValue(1 as never); // first player's answer

    const res = await POST(
      makeReq({ ownOptionId: 'opt-a', predictionOptionId: 'opt-b', clientElapsedMs: 1000 }),
      makeCtx(),
    );
    expect(res.status).toBe(200);

    expect(prismaMock.answer.createMany).toHaveBeenCalledTimes(1);
    const data = prismaMock.answer.createMany.mock.calls[0]?.[0]?.data as Array<{
      kind: string;
      selectedOptionId: string;
      userId: string;
      gameRoundQuestionId: string;
      effectiveElapsedMs: number;
    }>;
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      kind: 'OWN',
      selectedOptionId: 'opt-a',
      userId: 'user-1', // CREATOR is active player -> couple.creatorId
      gameRoundQuestionId: 'grq-1',
    });
    expect(data[1]).toMatchObject({
      kind: 'PREDICTION',
      selectedOptionId: 'opt-b',
      userId: 'user-1',
      gameRoundQuestionId: 'grq-1',
    });
    expect(data[0]?.effectiveElapsedMs).toBe(data[1]?.effectiveElapsedMs);
  });

  it('SCENARIO/FACEAFACE happy path inserts 1 row (OWN)', async () => {
    mockRoundAndQuestion('SCENARIO', SCENARIO_QUESTION);
    prismaMock.answer.count.mockResolvedValue(1 as never);

    const res = await POST(makeReq({ optionId: 'opt-b', clientElapsedMs: 500 }), makeCtx());
    expect(res.status).toBe(200);

    expect(prismaMock.answer.createMany).toHaveBeenCalledTimes(1);
    const data = prismaMock.answer.createMany.mock.calls[0]?.[0]?.data as Array<{
      kind: string;
      selectedOptionId: string;
    }>;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ kind: 'OWN', selectedOptionId: 'opt-b' });
  });

  it("first player's answer: phase -> PASS_DEVICE, role flips, currentQuestionShownAt cleared", async () => {
    prismaMock.answer.count.mockResolvedValue(1 as never);

    const res = await POST(
      makeReq({ ownOptionId: 'opt-a', predictionOptionId: 'opt-b' }),
      makeCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      phase: 'PASS_DEVICE',
      activePlayerRole: 'PARTNER', // flipped from CREATOR
      currentRoundNumber: 1,
      currentQuestionNumber: 1,
      roundCompleted: false,
    });

    expect(prismaMock.gameSession.update).toHaveBeenCalledTimes(1);
    const updateData = prismaMock.gameSession.update.mock.calls[0]?.[0]?.data;
    expect(updateData).toMatchObject({
      phase: 'PASS_DEVICE',
      activePlayerRole: 'PARTNER',
      currentQuestionNumber: 1,
      currentQuestionShownAt: null,
    });
    expect(prismaMock.gameRound.update).not.toHaveBeenCalled();
  });

  it("second player's answer on question 5: roundCompleted true, phase -> ROUND_REVEAL, GameRound marked COMPLETED", async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SESSION,
      currentQuestionNumber: 5,
      activePlayerRole: 'PARTNER',
    });
    prismaMock.answer.count.mockResolvedValue(2 as never);

    const res = await POST(
      makeReq({ ownOptionId: 'opt-a', predictionOptionId: 'opt-b' }),
      makeCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      phase: 'ROUND_REVEAL',
      activePlayerRole: 'PARTNER',
      currentRoundNumber: 1,
      currentQuestionNumber: 5,
      roundCompleted: true,
    });

    expect(prismaMock.gameRound.update).toHaveBeenCalledTimes(1);
    const roundUpdateCall = prismaMock.gameRound.update.mock.calls[0]?.[0];
    expect(roundUpdateCall?.where).toEqual({ id: 'round-1' });
    expect(roundUpdateCall?.data).toMatchObject({ status: 'COMPLETED' });
    expect((roundUpdateCall?.data as { completedAt: Date }).completedAt).toBeInstanceOf(Date);
  });

  it('duplicate submit (same user, same question) is idempotent: 200, still exactly one insert attempt, P2002 swallowed', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(p2002(['gameRoundQuestionId', 'userId', 'kind']));
    prismaMock.answer.count.mockResolvedValue(1 as never);

    const res = await POST(
      makeReq({ ownOptionId: 'opt-a', predictionOptionId: 'opt-b' }),
      makeCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.phase).toBe('PASS_DEVICE');
    expect(prismaMock.answer.count).toHaveBeenCalledTimes(1);
  });

  it('rethrows a non-P2002 transaction error', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error('boom'));

    await expect(
      POST(makeReq({ ownOptionId: 'opt-a', predictionOptionId: 'opt-b' }), makeCtx()),
    ).rejects.toThrow('boom');
  });

  it('returns 401 when unauthenticated', async () => {
    const { NextResponse } = await import('next/server');
    (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makeReq({}), makeCtx());
    expect(res.status).toBe(401);
    expect(findActivatedCoupleForUser).not.toHaveBeenCalled();
  });

  it('returns 403 when CSRF verification fails', async () => {
    const { NextResponse } = await import('next/server');
    (verifyCsrf as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );
    const res = await POST(makeReq({}), makeCtx());
    expect(res.status).toBe(403);
    expect(findActivatedCoupleForUser).not.toHaveBeenCalled();
  });

  it("source exports runtime = 'nodejs'", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('withRequestContext');
  });
});

describe('POST /api/games/:id/answers — a round is as long as the format says', () => {
  it('ends an Express first manche at question 2, not at 5', async () => {
    // The route must read the round's real length rather than a constant.
    // Before formats, question 2 of a 2-question round advanced to question
    // 3 — a question that was never dealt, so the next screen had nothing
    // to show and the game stalled with every test still green.
    (countQuestionsInRound as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SESSION,
      currentQuestionNumber: 2,
      activePlayerRole: 'PARTNER',
    });
    prismaMock.answer.count.mockResolvedValue(2 as never);

    const res = await POST(
      makeReq({ ownOptionId: 'opt-a', predictionOptionId: 'opt-b' }),
      makeCtx(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ phase: 'ROUND_REVEAL', roundCompleted: true });
    expect(prismaMock.gameRound.update).toHaveBeenCalledTimes(1);
  });

  it('does NOT end a Longue soirée manche at question 5', async () => {
    (countQuestionsInRound as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(10);
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SESSION,
      currentQuestionNumber: 5,
      activePlayerRole: 'PARTNER',
    });
    prismaMock.answer.count.mockResolvedValue(2 as never);

    const res = await POST(
      makeReq({ ownOptionId: 'opt-a', predictionOptionId: 'opt-b' }),
      makeCtx(),
    );
    expect(await res.json()).toMatchObject({
      phase: 'PASS_DEVICE',
      currentQuestionNumber: 6,
      roundCompleted: false,
    });
    expect(prismaMock.gameRound.update).not.toHaveBeenCalled();
  });
});
