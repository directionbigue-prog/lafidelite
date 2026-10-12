import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
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

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/games/session-1/start-turn', { method: 'POST' });
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

const BASE_SESSION = {
  id: 'session-1',
  coupleId: 'couple-1',
  status: 'IN_PROGRESS',
  currentRoundNumber: 1,
  currentQuestionNumber: 1,
  phase: 'PASS_DEVICE',
  activePlayerRole: 'CREATOR',
  currentQuestionShownAt: null as Date | null,
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

beforeEach(() => {
  vi.clearAllMocks();
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
  (findActivatedCoupleForUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    ACTIVATED_COUPLE,
  );
  prismaMock.gameRound.findFirst.mockResolvedValue({
    id: 'round-1',
    status: 'IN_PROGRESS',
    type: 'MIROIR',
  } as never);
  prismaMock.gameRoundQuestion.findFirst.mockResolvedValue({
    question: MIROIR_QUESTION,
  } as never);
});

describe('POST /api/games/:id/start-turn', () => {
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
    expect(loadOwnedGameSession).toHaveBeenCalledWith(expect.anything(), 'couple-1', 'session-1');
  });

  it('returns 409 INVALID_PHASE from ROUND_REVEAL', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SESSION,
      phase: 'ROUND_REVEAL',
    });

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('INVALID_PHASE');
    expect(prismaMock.gameSession.update).not.toHaveBeenCalled();
  });

  it('returns 409 INVALID_PHASE from ROUND_INTRO', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SESSION,
      phase: 'ROUND_INTRO',
    });

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('INVALID_PHASE');
  });

  it('from PASS_DEVICE: 200, currentQuestionShownAt stamped and persisted', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SESSION,
      phase: 'PASS_DEVICE',
      currentQuestionShownAt: null,
    });

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      activePlayerRole: 'CREATOR',
      roundType: 'MIROIR',
      currentQuestionNumber: 1,
      question: {
        id: 'q-1',
        roundType: 'MIROIR',
        prompt: 'Question miroir ?',
        options: [
          { id: 'opt-a', text: 'Option A' },
          { id: 'opt-b', text: 'Option B' },
        ],
      },
    });

    expect(prismaMock.gameSession.update).toHaveBeenCalledTimes(1);
    const updateCall = prismaMock.gameSession.update.mock.calls[0]?.[0];
    expect(updateCall?.where).toEqual({ id: 'session-1' });
    expect(updateCall?.data).toMatchObject({ phase: 'ANSWERING' });
    expect(
      (updateCall?.data as { currentQuestionShownAt: Date }).currentQuestionShownAt,
    ).toBeInstanceOf(Date);
  });

  it('called twice in a row: second call (already ANSWERING) does not move the timestamp', async () => {
    const shownAt = new Date('2026-09-03T10:00:00.000Z');
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SESSION,
      phase: 'ANSWERING',
      currentQuestionShownAt: shownAt,
    });

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    // Idempotent remount: no write to GameSession at all — the timestamp
    // that's already there must not be touched.
    expect(prismaMock.gameSession.update).not.toHaveBeenCalled();
  });

  it('flips a PENDING GameRound to IN_PROGRESS with startedAt (round-2/3 entry)', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SESSION,
      currentRoundNumber: 2,
      phase: 'PASS_DEVICE',
    });
    prismaMock.gameRound.findFirst.mockResolvedValue({
      id: 'round-2',
      status: 'PENDING',
      type: 'SCENARIO',
    } as never);

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);

    expect(prismaMock.gameRound.update).toHaveBeenCalledTimes(1);
    const roundUpdateCall = prismaMock.gameRound.update.mock.calls[0]?.[0];
    expect(roundUpdateCall?.where).toEqual({ id: 'round-2' });
    expect(roundUpdateCall?.data).toMatchObject({ status: 'IN_PROGRESS' });
    expect((roundUpdateCall?.data as { startedAt: Date }).startedAt).toBeInstanceOf(Date);
  });

  it('does not touch a GameRound that is already IN_PROGRESS', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_SESSION,
      phase: 'PASS_DEVICE',
    });
    prismaMock.gameRound.findFirst.mockResolvedValue({
      id: 'round-1',
      status: 'IN_PROGRESS',
      type: 'MIROIR',
    } as never);

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    expect(prismaMock.gameRound.update).not.toHaveBeenCalled();
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
