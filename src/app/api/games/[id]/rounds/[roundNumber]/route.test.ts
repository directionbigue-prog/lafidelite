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

vi.mock('@/lib/server/game/session-helpers', () => ({
  loadOwnedGameSession: vi.fn(),
}));

// `shapeQuestionForClient` stays the REAL implementation (several tests
// below rely on it actually stripping `weight`); only `canRevealPartnerAnswer`
// is wrapped as a spy, defaulting to the real implementation, so the I-1
// regression test can force it to `false` on demand to prove the
// response-boundary re-check is an independent gate and not dead code.
vi.mock('@/lib/server/game/response-shaping', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/game/response-shaping')>(
    '@/lib/server/game/response-shaping',
  );
  return {
    ...actual,
    canRevealPartnerAnswer: vi.fn(actual.canRevealPartnerAnswer),
  };
});

import { GET } from './route';
import { requireAuth } from '@/lib/server/middleware';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { loadOwnedGameSession } from '@/lib/server/game/session-helpers';
import { canRevealPartnerAnswer } from '@/lib/server/game/response-shaping';
import { prisma } from '@/lib/server/prisma';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/games/session-1/rounds/1', { method: 'GET' });
}

function makeCtx(
  id = 'session-1',
  roundNumber = '1',
): { params: Promise<{ id: string; roundNumber: string }> } {
  return { params: Promise.resolve({ id, roundNumber }) };
}

const ACTIVATED_COUPLE = {
  id: 'couple-1',
  creatorId: 'user-1',
  partnerId: 'user-2' as string | null,
  disclaimerAcceptedByCreatorAt: new Date('2026-09-01T00:00:00.000Z'),
  disclaimerAcceptedByPartnerAt: new Date('2026-09-01T00:00:00.000Z'),
  cumulativeCoupleScore: 100,
};

const OWNED_SESSION = {
  id: 'session-1',
  coupleId: 'couple-1',
  status: 'COMPLETED',
  currentRoundNumber: 3,
  currentQuestionNumber: 5,
  phase: 'COMPLETE',
  activePlayerRole: 'CREATOR',
  currentQuestionShownAt: null as Date | null,
  jokersRemainingCreator: 2,
  jokersRemainingPartner: 2,
  startedAt: new Date('2026-09-01T00:00:00.000Z'),
  completedAt: new Date('2026-09-01T00:10:00.000Z'),
};

const MIROIR_OPTIONS = [
  { id: 'a', text: 'A', weight: 999 }, // weight must never reach the response
  { id: 'b', text: 'B', weight: 999 },
];

function answerRow(over: {
  userId: string;
  kind: 'OWN' | 'PREDICTION';
  selectedOptionId: string | null;
  isSkipped?: boolean;
}) {
  return {
    userId: over.userId,
    kind: over.kind,
    selectedOptionId: over.selectedOptionId,
    isSkipped: over.isSkipped ?? false,
  };
}

function mirrorGameRoundQuestions() {
  return [
    {
      question: {
        id: 'q-m1',
        roundType: 'MIROIR',
        prompt: 'Prompt 1',
        options: MIROIR_OPTIONS,
      },
      answers: [
        answerRow({ userId: 'user-1', kind: 'OWN', selectedOptionId: 'a' }),
        answerRow({ userId: 'user-1', kind: 'PREDICTION', selectedOptionId: 'b' }),
        answerRow({ userId: 'user-2', kind: 'OWN', selectedOptionId: 'b' }),
        answerRow({ userId: 'user-2', kind: 'PREDICTION', selectedOptionId: 'a' }),
      ],
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
  (findActivatedCoupleForUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    ...ACTIVATED_COUPLE,
  });
  (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(OWNED_SESSION);
});

describe('GET /api/games/:id/rounds/:roundNumber', () => {
  it('returns 404 NO_ACTIVE_COUPLE when the user has no active couple', async () => {
    (findActivatedCoupleForUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NO_ACTIVE_COUPLE');
    expect(loadOwnedGameSession).not.toHaveBeenCalled();
  });

  it('returns 404 GAME_SESSION_NOT_FOUND when loadOwnedGameSession returns null (not found or not owned)', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('GAME_SESSION_NOT_FOUND');
    expect(prismaMock.gameRound.findFirst).not.toHaveBeenCalled();
  });

  it('scopes ownership through loadOwnedGameSession with the caller couple id, never a client-supplied one', async () => {
    prismaMock.gameRound.findFirst.mockResolvedValue({
      id: 'round-1',
      type: 'MIROIR',
      status: 'COMPLETED',
    } as never);
    prismaMock.gameRoundQuestion.findMany.mockResolvedValue(mirrorGameRoundQuestions() as never);

    await GET(makeReq(), makeCtx());

    expect(findActivatedCoupleForUser).toHaveBeenCalledWith(prisma, 'user-1');
    expect(loadOwnedGameSession).toHaveBeenCalledWith(prisma, 'couple-1', 'session-1');

    // I-3 regression guard: the GameRound lookup MUST be scoped to this
    // session's id, not just `roundNumber` alone — dropping
    // `gameSessionId: session.id` here would let `GET /rounds/1` return
    // whichever GameRound with roundNumber:1 Postgres happens to yield
    // first, including another couple's completed round (the exact
    // cross-couple reveal Design Decision 5 exists to prevent).
    expect(prismaMock.gameRound.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { gameSessionId: 'session-1', roundNumber: 1 } }),
    );
    expect(prismaMock.gameRoundQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gameRoundId: 'round-1' },
        orderBy: { orderIndex: 'asc' },
      }),
    );
  });

  // I-1 regression guard: `canRevealPartnerAnswer` must be an INDEPENDENT
  // gate, not a tautological third operand folded into the primary status
  // guard above. Forcing it to return `false` here — even though
  // round.status === 'COMPLETED' already satisfied the primary guard —
  // proves the response-boundary re-check actually controls the response
  // rather than being dead code that could be deleted with every test
  // still green.
  it('the response-boundary canRevealPartnerAnswer re-check is a genuine independent gate (I-1)', async () => {
    prismaMock.gameRound.findFirst.mockResolvedValue({
      id: 'round-1',
      type: 'MIROIR',
      status: 'COMPLETED',
    } as never);
    prismaMock.gameRoundQuestion.findMany.mockResolvedValue(mirrorGameRoundQuestions() as never);
    (canRevealPartnerAnswer as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('ROUND_NOT_AVAILABLE');
  });

  it('returns 404 ROUND_NOT_AVAILABLE when the round does not exist', async () => {
    prismaMock.gameRound.findFirst.mockResolvedValue(null);

    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('ROUND_NOT_AVAILABLE');
    expect(prismaMock.gameRoundQuestion.findMany).not.toHaveBeenCalled();
  });

  it('returns the SAME 404 ROUND_NOT_AVAILABLE when the round exists but is not yet COMPLETED (never leaks in-progress answers)', async () => {
    prismaMock.gameRound.findFirst.mockResolvedValue({
      id: 'round-1',
      type: 'MIROIR',
      status: 'IN_PROGRESS',
    } as never);

    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('ROUND_NOT_AVAILABLE');
    expect(prismaMock.gameRoundQuestion.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 ROUND_NOT_AVAILABLE for a PENDING round too', async () => {
    prismaMock.gameRound.findFirst.mockResolvedValue({
      id: 'round-1',
      type: 'MIROIR',
      status: 'PENDING',
    } as never);

    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('ROUND_NOT_AVAILABLE');
  });

  it('returns 404 ROUND_NOT_AVAILABLE for a non-numeric roundNumber, without ever querying GameRound', async () => {
    const res = await GET(makeReq(), makeCtx('session-1', 'not-a-number'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('ROUND_NOT_AVAILABLE');
    expect(prismaMock.gameRound.findFirst).not.toHaveBeenCalled();
  });

  it('a completed MIROIR round returns both answers and both predictions, options stripped of weight', async () => {
    prismaMock.gameRound.findFirst.mockResolvedValue({
      id: 'round-1',
      type: 'MIROIR',
      status: 'COMPLETED',
    } as never);
    prismaMock.gameRoundQuestion.findMany.mockResolvedValue(mirrorGameRoundQuestions() as never);

    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.roundNumber).toBe(1);
    expect(body.type).toBe('MIROIR');
    expect(body.questions).toHaveLength(1);

    const q = body.questions[0];
    expect(q.id).toBe('q-m1');
    expect(q.prompt).toBe('Prompt 1');
    expect(q.options).toEqual([
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ]);
    expect(q.creatorAnswer).toEqual({ selectedOptionId: 'a', isSkipped: false });
    expect(q.partnerAnswer).toEqual({ selectedOptionId: 'b', isSkipped: false });
    expect(q.creatorPrediction).toEqual({ selectedOptionId: 'b', isSkipped: false });
    expect(q.partnerPrediction).toEqual({ selectedOptionId: 'a', isSkipped: false });

    const raw = JSON.stringify(body);
    expect(raw).not.toContain('999');
    expect(raw).not.toContain('weight');
  });

  it('never leaks a raw option weight in the response text, even indirectly', async () => {
    prismaMock.gameRound.findFirst.mockResolvedValue({
      id: 'round-1',
      type: 'MIROIR',
      status: 'COMPLETED',
    } as never);
    prismaMock.gameRoundQuestion.findMany.mockResolvedValue(mirrorGameRoundQuestions() as never);

    const res = await GET(makeReq(), makeCtx());
    const raw = await res.text();
    expect(raw).not.toContain('"weight"');
  });

  it('a non-MIROIR round (SCENARIO/FACEAFACE) never includes prediction fields', async () => {
    prismaMock.gameRound.findFirst.mockResolvedValue({
      id: 'round-1',
      type: 'FACEAFACE',
      status: 'COMPLETED',
    } as never);
    prismaMock.gameRoundQuestion.findMany.mockResolvedValue([
      {
        question: {
          id: 'q-f1',
          roundType: 'FACEAFACE',
          prompt: 'Face a face',
          options: [
            { id: 'x', text: 'X' },
            { id: 'y', text: 'Y' },
          ],
        },
        answers: [
          answerRow({ userId: 'user-1', kind: 'OWN', selectedOptionId: 'x' }),
          answerRow({ userId: 'user-2', kind: 'OWN', selectedOptionId: 'y' }),
        ],
      },
    ] as never);

    const res = await GET(makeReq(), makeCtx());
    const body = await res.json();
    const q = body.questions[0];
    expect(q.creatorAnswer).toEqual({ selectedOptionId: 'x', isSkipped: false });
    expect(q.partnerAnswer).toEqual({ selectedOptionId: 'y', isSkipped: false });
    expect(q).not.toHaveProperty('creatorPrediction');
    expect(q).not.toHaveProperty('partnerPrediction');
  });

  it('a missing answer row (e.g. a skipped MIROIR prediction) defaults to selectedOptionId:null, isSkipped:true', async () => {
    prismaMock.gameRound.findFirst.mockResolvedValue({
      id: 'round-1',
      type: 'MIROIR',
      status: 'COMPLETED',
    } as never);
    prismaMock.gameRoundQuestion.findMany.mockResolvedValue([
      {
        question: {
          id: 'q-m1',
          roundType: 'MIROIR',
          prompt: 'Prompt 1',
          options: MIROIR_OPTIONS,
        },
        answers: [
          // user-1 skipped: only one OWN row, no PREDICTION row at all.
          answerRow({ userId: 'user-1', kind: 'OWN', selectedOptionId: null, isSkipped: true }),
          answerRow({ userId: 'user-2', kind: 'OWN', selectedOptionId: 'b' }),
          answerRow({ userId: 'user-2', kind: 'PREDICTION', selectedOptionId: 'a' }),
        ],
      },
    ] as never);

    const res = await GET(makeReq(), makeCtx());
    const body = await res.json();
    const q = body.questions[0];
    expect(q.creatorAnswer).toEqual({ selectedOptionId: null, isSkipped: true });
    expect(q.creatorPrediction).toEqual({ selectedOptionId: null, isSkipped: true });
  });

  it('returns 401 when unauthenticated', async () => {
    const { NextResponse } = await import('next/server');
    (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(401);
    expect(findActivatedCoupleForUser).not.toHaveBeenCalled();
  });

  it("source exports runtime = 'nodejs' and imports no CSRF check (GET, not a mutation)", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('withRequestContext');
    expect(src).not.toMatch(/import\s*\{[^}]*verifyCsrf/);
  });
});
