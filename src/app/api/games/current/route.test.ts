import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/server/couples/queries', () => ({
  findActivatedCoupleForUser: vi.fn(),
}));

import { GET } from './route';
import { requireAuth } from '@/lib/server/middleware';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/games/current', { method: 'GET' });
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
  status: 'IN_PROGRESS',
  currentRoundNumber: 1,
  currentQuestionNumber: 2,
  phase: 'PASS_DEVICE',
  activePlayerRole: 'CREATOR',
  currentQuestionShownAt: null as Date | null,
  jokersRemainingCreator: 2,
  jokersRemainingPartner: 2,
};

const SCENARIO_QUESTION = {
  id: 'q-1',
  roundType: 'SCENARIO',
  prompt: 'Que ferais-tu ?',
  options: [
    { id: 'opt-a', text: 'Option A', weight: 3 },
    { id: 'opt-b', text: 'Option B', weight: 1 },
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
  // A Standard game: three rounds of five. The route reports these
  // straight from the rows, so the client never has to assume a length.
  prismaMock.gameRound.findMany.mockResolvedValue([
    { _count: { questions: 5 } },
    { _count: { questions: 5 } },
    { _count: { questions: 5 } },
  ] as never);
});

describe('GET /api/games/current', () => {
  it('returns 404 NO_ACTIVE_COUPLE when the user has no active couple', async () => {
    (findActivatedCoupleForUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(makeReq());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NO_ACTIVE_COUPLE');
    expect(prismaMock.gameSession.findFirst).not.toHaveBeenCalled();
  });

  it('returns 404 NO_ACTIVE_GAME when no session is IN_PROGRESS', async () => {
    prismaMock.gameSession.findFirst.mockResolvedValue(null);

    const res = await GET(makeReq());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NO_ACTIVE_GAME');
  });

  it('PASS_DEVICE phase: no `question` key in the response, no persistence write', async () => {
    prismaMock.gameSession.findFirst.mockResolvedValue({ ...BASE_SESSION } as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: 'session-1',
      status: 'IN_PROGRESS',
      currentRoundNumber: 1,
      currentQuestionNumber: 2,
      phase: 'PASS_DEVICE',
      activePlayerRole: 'CREATOR',
      jokersRemainingCreator: 2,
      jokersRemainingPartner: 2,
      questionsPerRound: [5, 5, 5],
    });
    expect('question' in body).toBe(false);
    expect(prismaMock.gameSession.update).not.toHaveBeenCalled();
    expect(prismaMock.gameRoundQuestion.findFirst).not.toHaveBeenCalled();
  });

  it('ANSWERING phase: shaped question present, no `weight` key anywhere in the JSON', async () => {
    prismaMock.gameSession.findFirst.mockResolvedValue({
      ...BASE_SESSION,
      phase: 'ANSWERING',
      currentQuestionShownAt: new Date('2026-09-03T10:00:00.000Z'),
    } as never);
    prismaMock.gameRoundQuestion.findFirst.mockResolvedValue({
      question: SCENARIO_QUESTION,
    } as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).not.toContain('weight');

    const body = JSON.parse(raw);
    expect(body.phase).toBe('ANSWERING');
    expect(body.question).toEqual({
      id: 'q-1',
      roundType: 'SCENARIO',
      prompt: 'Que ferais-tu ?',
      options: [
        { id: 'opt-a', text: 'Option A' },
        { id: 'opt-b', text: 'Option B' },
      ],
    });

    const grqCall = prismaMock.gameRoundQuestion.findFirst.mock.calls[0]?.[0];
    expect(grqCall?.where).toMatchObject({
      orderIndex: 1, // currentQuestionNumber(2) - 1
      gameRound: { gameSessionId: 'session-1', roundNumber: 1 },
    });
  });

  it('ROUND_INTRO on read: response reflects PASS_DEVICE and the DB row is updated', async () => {
    prismaMock.gameSession.findFirst.mockResolvedValue({
      ...BASE_SESSION,
      phase: 'ROUND_INTRO',
    } as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.phase).toBe('PASS_DEVICE');
    expect('question' in body).toBe(false);

    // Consumer-facing consequence, stated explicitly because a client
    // boot-guard already got this wrong once: this endpoint can NEVER
    // return ROUND_INTRO. `/jeu/[id]/manche-intro` therefore accepts
    // PASS_DEVICE alongside ROUND_INTRO — guarding on ROUND_INTRO alone
    // matched nothing and silently skipped the round 2 and 3 intro
    // screens. If this assertion ever needs changing, that guard's
    // `expected` list must change with it.
    expect(body.phase).not.toBe('ROUND_INTRO');

    expect(prismaMock.gameSession.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.gameSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { phase: 'PASS_DEVICE' },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const { NextResponse } = await import('next/server');
    (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(findActivatedCoupleForUser).not.toHaveBeenCalled();
  });

  it("source exports runtime = 'nodejs'", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('withRequestContext');
  });
  it('reports the real round lengths, including a format that does not divide evenly', async () => {
    // Express is 2/2/1. Any client that multiplied one round's length by
    // three would show a 6-question game and a bar that never fills.
    prismaMock.gameSession.findFirst.mockResolvedValue({ ...BASE_SESSION } as never);
    prismaMock.gameRound.findMany.mockResolvedValue([
      { _count: { questions: 2 } },
      { _count: { questions: 2 } },
      { _count: { questions: 1 } },
    ] as never);

    const res = await GET(makeReq());
    expect((await res.json()).questionsPerRound).toEqual([2, 2, 1]);
  });
});
