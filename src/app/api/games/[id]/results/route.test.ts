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

import { GET } from './route';
import { requireAuth } from '@/lib/server/middleware';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { loadOwnedGameSession } from '@/lib/server/game/session-helpers';
import { prisma } from '@/lib/server/prisma';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/games/session-1/results', { method: 'GET' });
}

function makeCtx(id = 'session-1'): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const ACTIVATED_COUPLE = {
  id: 'couple-1',
  creatorId: 'user-1',
  partnerId: 'user-2' as string | null,
  disclaimerAcceptedByCreatorAt: new Date('2026-09-01T00:00:00.000Z'),
  disclaimerAcceptedByPartnerAt: new Date('2026-09-01T00:00:00.000Z'),
  cumulativeCoupleScore: 100,
};

const COMPLETED_SESSION = {
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

const CONVERSATION_PROMPTS = ['Q1?', 'Q2?', 'Q3?'];

function baseGameResult(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'result-1',
    gameSessionId: 'session-1',
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
    gapPercent: (16 / 55) * 100,
    gapMasked: false,
    winnerRole: 'CREATOR',
    conversationPrompts: CONVERSATION_PROMPTS,
    createdAt: new Date('2026-09-01T00:10:00.000Z'),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
  (findActivatedCoupleForUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    ...ACTIVATED_COUPLE,
  });
  (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    COMPLETED_SESSION,
  );
});

describe('GET /api/games/:id/results', () => {
  it('returns 404 NO_ACTIVE_COUPLE when the user has no active couple', async () => {
    (findActivatedCoupleForUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NO_ACTIVE_COUPLE');
    expect(loadOwnedGameSession).not.toHaveBeenCalled();
  });

  it('returns 404 RESULTS_NOT_AVAILABLE when loadOwnedGameSession returns null (not found or not owned)', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('RESULTS_NOT_AVAILABLE');
    expect(prismaMock.gameResult.findUnique).not.toHaveBeenCalled();
  });

  it('returns the SAME 404 RESULTS_NOT_AVAILABLE when the session exists but is not yet COMPLETED (never leaks in-progress state)', async () => {
    (loadOwnedGameSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...COMPLETED_SESSION,
      status: 'IN_PROGRESS',
    });

    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('RESULTS_NOT_AVAILABLE');
    expect(prismaMock.gameResult.findUnique).not.toHaveBeenCalled();
  });

  it('scopes ownership through loadOwnedGameSession with the caller couple id, never a client-supplied one', async () => {
    prismaMock.gameResult.findUnique.mockResolvedValue(baseGameResult() as never);

    await GET(makeReq(), makeCtx());

    expect(findActivatedCoupleForUser).toHaveBeenCalledWith(prisma, 'user-1');
    expect(loadOwnedGameSession).toHaveBeenCalledWith(prisma, 'couple-1', 'session-1');
    expect(prismaMock.gameResult.findUnique).toHaveBeenCalledWith({
      where: { gameSessionId: 'session-1' },
    });
  });

  it('throws (500) when the session is COMPLETED but has no GameResult row (data-integrity violation)', async () => {
    prismaMock.gameResult.findUnique.mockResolvedValue(null);

    await expect(GET(makeReq(), makeCtx())).rejects.toThrow(/no GameResult/);
  });

  it('gapMasked: false — numeric scores present, no maskedMessage', async () => {
    prismaMock.gameResult.findUnique.mockResolvedValue(
      baseGameResult({ gapMasked: false }) as never,
    );

    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.creatorTotalScore).toBe(55);
    expect(body.partnerTotalScore).toBe(39);
    expect(body.gapPercent).toBeCloseTo((16 / 55) * 100, 6);
    expect(body).not.toHaveProperty('maskedMessage');

    expect(body.coupleScore).toBe(20);
    expect(body.complicityLevel).toBe('COMPLICES');
    expect(body.winnerRole).toBe('CREATOR');
    expect(body.conversationPrompts).toEqual(CONVERSATION_PROMPTS);
    expect(body.creatorTitle).toBe("Cœur d'Or");
    expect(body.partnerTitle).toBe('Cœur Sincère');
  });

  it('gapMasked: true — numeric scores and gapPercent are ABSENT from the JSON (not null, not zero), maskedMessage present', async () => {
    prismaMock.gameResult.findUnique.mockResolvedValue(
      baseGameResult({
        gapMasked: true,
        creatorTotalScore: 90,
        partnerTotalScore: 10,
        gapPercent: 88.9,
      }) as never,
    );

    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const raw = await res.text();
    const body = JSON.parse(raw);

    expect(body).not.toHaveProperty('creatorTotalScore');
    expect(body).not.toHaveProperty('partnerTotalScore');
    expect(body).not.toHaveProperty('gapPercent');
    // Not just absent as a key — the raw numbers must never appear at all.
    expect(raw).not.toContain('"creatorTotalScore"');
    expect(raw).not.toContain('"partnerTotalScore"');
    expect(raw).not.toContain('"gapPercent"');
    expect(raw).not.toContain('88.9');

    expect(body.maskedMessage).toBe('Match serré sur les valeurs, écart sur la connaissance.');

    expect(body.coupleScore).toBe(20);
    expect(body.complicityLevel).toBe('COMPLICES');
    expect(body.winnerRole).toBe('CREATOR');
    expect(body.conversationPrompts).toEqual(CONVERSATION_PROMPTS);
  });

  it('derives a TIE result to both "Cœur d\'Or" titles, never a pejorative label', async () => {
    prismaMock.gameResult.findUnique.mockResolvedValue(
      baseGameResult({
        winnerRole: 'TIE',
        creatorTotalScore: 40,
        partnerTotalScore: 40,
        gapMasked: false,
        gapPercent: 0,
      }) as never,
    );

    const res = await GET(makeReq(), makeCtx());
    const body = await res.json();
    expect(body.creatorTitle).toBe("Cœur d'Or");
    expect(body.partnerTitle).toBe("Cœur d'Or");
  });

  // I-2 regression guard: deriveTitles must key off the PERSISTED
  // winnerRole column, never re-compare creatorTotalScore/partnerTotalScore
  // itself — otherwise a future change to how winnerRole is decided (e.g. a
  // tie tolerance) could silently desync the titles from winnerRole. This
  // fixture is deliberately inconsistent (winnerRole says TIE, but the raw
  // scores are not equal) so a re-comparison implementation would fail it:
  // a score-based deriveTitles would emit "Cœur d'Or"/"Cœur Sincère" here,
  // not "Cœur d'Or"/"Cœur d'Or".
  it('derives titles from the persisted winnerRole, not by re-comparing the raw scores (would fail under score-based re-derivation)', async () => {
    prismaMock.gameResult.findUnique.mockResolvedValue(
      baseGameResult({
        winnerRole: 'TIE',
        creatorTotalScore: 90,
        partnerTotalScore: 10,
        gapMasked: true,
      }) as never,
    );

    const res = await GET(makeReq(), makeCtx());
    const body = await res.json();
    expect(body.winnerRole).toBe('TIE');
    expect(body.creatorTitle).toBe("Cœur d'Or");
    expect(body.partnerTitle).toBe("Cœur d'Or");
  });

  it('throws (500) when GameResult.winnerRole is null (data-integrity violation, not a leak-worthy state)', async () => {
    prismaMock.gameResult.findUnique.mockResolvedValue(
      baseGameResult({ winnerRole: null }) as never,
    );

    await expect(GET(makeReq(), makeCtx())).rejects.toThrow(/invalid winnerRole/);
  });

  it('throws (500) when GameResult.winnerRole holds a value outside CREATOR/PARTNER/TIE', async () => {
    prismaMock.gameResult.findUnique.mockResolvedValue(
      baseGameResult({ winnerRole: 'BOGUS' }) as never,
    );

    await expect(GET(makeReq(), makeCtx())).rejects.toThrow(/invalid winnerRole/);
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
