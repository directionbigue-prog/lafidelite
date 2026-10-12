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

function makeReq(body: unknown = {}): NextRequest {
  return new NextRequest('http://test/api/games/session-1/skip', {
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

  prismaMock.gameRound.findFirst.mockResolvedValue({ id: 'round-1' } as never);
  prismaMock.gameRoundQuestion.findFirst.mockResolvedValue({ id: 'grq-1' } as never);

  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
  prismaMock.answer.create.mockResolvedValue({} as never);
  prismaMock.answer.count.mockResolvedValue(1 as never);
  prismaMock.gameSession.update.mockResolvedValue({} as never);
  prismaMock.gameRound.update.mockResolvedValue({} as never);
});

describe('POST /api/games/:id/skip', () => {
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

  it('returns 409 NOT_ANSWERING_PHASE when phase is not ANSWERING', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SESSION,
      phase: 'PASS_DEVICE',
    });

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('NOT_ANSWERING_PHASE');
    expect(prismaMock.answer.create).not.toHaveBeenCalled();
  });

  it('returns 403 NO_JOKERS_LEFT when the active player (CREATOR) has 0 jokers, writing nothing', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SESSION,
      jokersRemainingCreator: 0,
    });

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('NO_JOKERS_LEFT');
    expect(prismaMock.answer.create).not.toHaveBeenCalled();
    expect(prismaMock.gameSession.update).not.toHaveBeenCalled();
    expect(prismaMock.gameRound.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 NO_JOKERS_LEFT when the active player (PARTNER) has 0 jokers, writing nothing', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SESSION,
      activePlayerRole: 'PARTNER',
      jokersRemainingPartner: 0,
    });

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('NO_JOKERS_LEFT');
    expect(prismaMock.answer.create).not.toHaveBeenCalled();
    expect(prismaMock.gameSession.update).not.toHaveBeenCalled();
  });

  it('happy path (CREATOR): inserts one skipped OWN Answer row, decrements jokersRemainingCreator only, never touches PREDICTION/optionWeight scoring', async () => {
    prismaMock.answer.count.mockResolvedValue(1 as never); // first player's answer

    const res = await POST(makeReq({ clientElapsedMs: 1000 }), makeCtx());
    expect(res.status).toBe(200);

    expect(prismaMock.answer.create).toHaveBeenCalledTimes(1);
    const data = prismaMock.answer.create.mock.calls[0]?.[0]?.data as {
      kind: string;
      selectedOptionId: string | null;
      isSkipped: boolean;
      userId: string;
      gameRoundQuestionId: string;
      effectiveElapsedMs: number;
    };
    expect(data).toMatchObject({
      kind: 'OWN',
      selectedOptionId: null,
      isSkipped: true,
      userId: 'user-1', // CREATOR is active player -> couple.creatorId
      gameRoundQuestionId: 'grq-1',
    });

    // Two gameSession.update calls are expected: the joker decrement
    // (inside the transaction) and the phase-advance persist (outside it).
    expect(prismaMock.gameSession.update).toHaveBeenCalledTimes(2);
    const jokerUpdateData = prismaMock.gameSession.update.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(jokerUpdateData).toMatchObject({ jokersRemainingCreator: { decrement: 1 } });
    expect(jokerUpdateData.jokersRemainingPartner).toBeUndefined();
    const phaseUpdateData = prismaMock.gameSession.update.mock.calls[1]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(phaseUpdateData.jokersRemainingCreator).toBeUndefined();
    expect(phaseUpdateData.jokersRemainingPartner).toBeUndefined();

    const body = await res.json();
    expect(body).toEqual({
      phase: 'PASS_DEVICE',
      activePlayerRole: 'PARTNER', // flipped from CREATOR
      currentRoundNumber: 1,
      currentQuestionNumber: 1,
      roundCompleted: false,
      jokersRemaining: 1, // 2 - 1
    });
  });

  it('happy path (PARTNER): decrements jokersRemainingPartner only', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SESSION,
      activePlayerRole: 'PARTNER',
    });
    prismaMock.answer.count.mockResolvedValue(1 as never);

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);

    const data = prismaMock.answer.create.mock.calls[0]?.[0]?.data as { userId: string };
    expect(data.userId).toBe('user-2'); // PARTNER is active player -> couple.partnerId

    const jokerUpdateData = prismaMock.gameSession.update.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(jokerUpdateData).toMatchObject({ jokersRemainingPartner: { decrement: 1 } });
    expect(jokerUpdateData.jokersRemainingCreator).toBeUndefined();

    const body = await res.json();
    expect(body.jokersRemaining).toBe(1);
  });

  it("second player's skip on question 5: roundCompleted true, phase -> ROUND_REVEAL, GameRound marked COMPLETED", async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SESSION,
      currentQuestionNumber: 5,
      activePlayerRole: 'PARTNER',
    });
    prismaMock.answer.count.mockResolvedValue(2 as never);

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
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

  it('duplicate/racing submit is idempotent: 200, P2002 swallowed, no double-decrement (transaction rolls back)', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(p2002(['gameRoundQuestionId', 'userId', 'kind']));
    prismaMock.answer.count.mockResolvedValue(1 as never);

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.phase).toBe('PASS_DEVICE');
    // Only one decrement ever actually commits (the winning request's,
    // inside the rolled-back transaction attempted by prismaMock.$transaction
    // above) — this losing attempt must not issue a second, separate
    // decrement call outside that transaction.
    expect(prismaMock.gameSession.update).toHaveBeenCalledTimes(1);
  });

  it('rethrows a non-P2002 transaction error', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error('boom'));

    await expect(POST(makeReq(), makeCtx())).rejects.toThrow('boom');
  });

  it('returns 400 VALIDATION_FAILED when clientElapsedMs has the wrong type', async () => {
    const res = await POST(makeReq({ clientElapsedMs: 'fast' }), makeCtx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.answer.create).not.toHaveBeenCalled();
  });

  it('accepts an empty body (clientElapsedMs is optional)', async () => {
    const req = new NextRequest('http://test/api/games/session-1/skip', { method: 'POST' });
    const res = await POST(req, makeCtx());
    expect(res.status).toBe(200);
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

  it('returns 403 when CSRF verification fails', async () => {
    const { NextResponse } = await import('next/server');
    (verifyCsrf as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(403);
    expect(findActivatedCoupleForUser).not.toHaveBeenCalled();
  });

  it("source exports runtime = 'nodejs'", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('withRequestContext');
  });
});
