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

vi.mock('@/lib/server/game/question-selection', () => ({
  selectQuestionsForRound: vi.fn(),
  recordQuestionUsage: vi.fn(),
}));

import { POST } from './route';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { selectQuestionsForRound, recordQuestionUsage } from '@/lib/server/game/question-selection';

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/games', { method: 'POST' });
}

const ACTIVATED_COUPLE = {
  id: 'couple-1',
  creatorId: 'user-1',
  partnerId: 'user-2',
  disclaimerAcceptedByCreatorAt: new Date('2026-09-01T00:00:00.000Z'),
  disclaimerAcceptedByPartnerAt: new Date('2026-09-01T00:00:00.000Z'),
  cumulativeCoupleScore: 0,
};

// 5 fixed question ids per round type, all distinct, so tests can assert
// "no repeated question id across the 15" without depending on Lot 1's real
// (already-tested) draw logic.
const ROUND_QUESTION_IDS: Record<string, string[]> = {
  MIROIR: ['q1', 'q2', 'q3', 'q4', 'q5'],
  SCENARIO: ['q6', 'q7', 'q8', 'q9', 'q10'],
  FACEAFACE: ['q11', 'q12', 'q13', 'q14', 'q15'],
};

beforeEach(() => {
  vi.clearAllMocks();
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
  (findActivatedCoupleForUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    ACTIVATED_COUPLE,
  );
  // The default caller still has their free game: the conditional UPDATE
  // matches one row. A test that wants the opposite says so locally.
  prismaMock.user.updateMany.mockResolvedValue({ count: 1 } as never);
  // Le couple par défaut ne détient AUCUN pack — palier Découverte. C'est
  // l'état d'un compte qui vient de s'inscrire, donc le cas le plus
  // fréquent, et c'est celui qui garde la règle de la partie offerte
  // active : un pack payant en dispense (voir la route).
  prismaMock.entitlement.findMany.mockResolvedValue([] as never);
  delete process.env.FREE_GAME_EXEMPT_EMAILS;
  (selectQuestionsForRound as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_client: unknown, { roundType }: { roundType: string }) => {
      const ids = ROUND_QUESTION_IDS[roundType] ?? [];
      return Promise.resolve(ids.map((id) => ({ id })));
    },
  );
  (recordQuestionUsage as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
  prismaMock.gameRound.create
    .mockResolvedValueOnce({ id: 'round-1' } as never)
    .mockResolvedValueOnce({ id: 'round-2' } as never)
    .mockResolvedValueOnce({ id: 'round-3' } as never);
  prismaMock.gameRoundQuestion.createMany.mockResolvedValue({ count: 5 } as never);
});

describe('POST /api/games', () => {
  it('returns 404 NO_ACTIVE_COUPLE when the user has no active couple', async () => {
    (findActivatedCoupleForUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(makeReq());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NO_ACTIVE_COUPLE');
    expect(prismaMock.gameSession.findFirst).not.toHaveBeenCalled();
  });

  it('gives the session-creation transaction more than the default 5s budget', async () => {
    // Regression: creating a session is ~15 statements, and against a remote
    // Postgres the default interactive-transaction timeout expired mid-write
    // — "Nouvelle partie" 500ed with "Transaction not found. Transaction ID
    // is invalid, refers to an old closed transaction".
    prismaMock.gameSession.findFirst.mockResolvedValue(null);
    prismaMock.gameSession.create.mockResolvedValue({
      id: 'session-1',
      status: 'IN_PROGRESS',
      currentRoundNumber: 1,
      currentQuestionNumber: 1,
      phase: 'PASS_DEVICE',
      activePlayerRole: 'CREATOR',
    } as never);

    await POST(makeReq());

    const options = prismaMock.$transaction.mock.calls[0]?.[1] as
      | { timeout?: number; maxWait?: number }
      | undefined;
    expect(options?.timeout).toBeGreaterThan(5_000);
    expect(options?.maxWait).toBeGreaterThan(0);
  });

  it('returns 403 DISCLAIMER_REQUIRED when either partner has not accepted the disclaimer', async () => {
    (findActivatedCoupleForUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...ACTIVATED_COUPLE,
      disclaimerAcceptedByPartnerAt: null,
    });

    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('DISCLAIMER_REQUIRED');
    expect(prismaMock.gameSession.findFirst).not.toHaveBeenCalled();
  });

  it('fresh create: 201 with 3 rounds x 5 questions persisted, no repeated question id across the 15', async () => {
    prismaMock.gameSession.findFirst.mockResolvedValue(null);
    prismaMock.gameSession.create.mockResolvedValue({
      id: 'session-1',
      status: 'IN_PROGRESS',
      currentRoundNumber: 1,
      currentQuestionNumber: 1,
      phase: 'PASS_DEVICE',
      activePlayerRole: 'CREATOR',
    } as never);

    const res = await POST(makeReq());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      id: 'session-1',
      status: 'IN_PROGRESS',
      currentRoundNumber: 1,
      currentQuestionNumber: 1,
      phase: 'PASS_DEVICE',
      activePlayerRole: 'CREATOR',
    });

    // selectQuestionsForRound called 3 times, in MIROIR/SCENARIO/FACEAFACE
    // order, with excludeQuestionIds accumulating across rounds.
    expect(selectQuestionsForRound).toHaveBeenCalledTimes(3);
    const calls = (selectQuestionsForRound as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]?.[1]).toMatchObject({
      coupleId: 'couple-1',
      roundType: 'MIROIR',
      count: 5,
      excludeQuestionIds: [],
    });
    expect(calls[1]?.[1]).toMatchObject({
      roundType: 'SCENARIO',
      count: 5,
      excludeQuestionIds: ROUND_QUESTION_IDS.MIROIR,
    });
    expect(calls[2]?.[1]).toMatchObject({
      roundType: 'FACEAFACE',
      count: 5,
      excludeQuestionIds: [
        ...(ROUND_QUESTION_IDS.MIROIR ?? []),
        ...(ROUND_QUESTION_IDS.SCENARIO ?? []),
      ],
    });

    // recordQuestionUsage called once with all 15 ids.
    expect(recordQuestionUsage).toHaveBeenCalledTimes(1);
    const allIds = (recordQuestionUsage as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[2] as string[];
    expect(allIds).toHaveLength(15);
    expect(new Set(allIds).size).toBe(15); // no repeats

    // 3 GameRound rows: round 1 IN_PROGRESS + startedAt, rounds 2-3 PENDING, no startedAt.
    expect(prismaMock.gameRound.create).toHaveBeenCalledTimes(3);
    const roundCalls = prismaMock.gameRound.create.mock.calls;
    expect(roundCalls[0]?.[0]?.data).toMatchObject({
      gameSessionId: 'session-1',
      roundNumber: 1,
      type: 'MIROIR',
      firstPlayerRole: 'CREATOR',
      status: 'IN_PROGRESS',
    });
    expect(roundCalls[0]?.[0]?.data?.startedAt).toBeInstanceOf(Date);
    expect(roundCalls[1]?.[0]?.data).toMatchObject({
      roundNumber: 2,
      type: 'SCENARIO',
      firstPlayerRole: 'PARTNER',
      status: 'PENDING',
      startedAt: null,
    });
    expect(roundCalls[2]?.[0]?.data).toMatchObject({
      roundNumber: 3,
      type: 'FACEAFACE',
      firstPlayerRole: 'CREATOR',
      status: 'PENDING',
      startedAt: null,
    });

    // 15 GameRoundQuestion rows across 3 createMany calls, orderIndex 0-4 each.
    expect(prismaMock.gameRoundQuestion.createMany).toHaveBeenCalledTimes(3);
    const cmCalls = prismaMock.gameRoundQuestion.createMany.mock.calls;
    for (const call of cmCalls) {
      const data = call[0]?.data as { orderIndex: number }[];
      expect(data).toHaveLength(5);
      expect(data.map((d) => d.orderIndex)).toEqual([0, 1, 2, 3, 4]);
    }

    // Question creation happened via the transaction client (tx === prismaMock here).
    expect(prismaMock.gameSession.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.gameSession.create.mock.calls[0]?.[0]?.data).toMatchObject({
      coupleId: 'couple-1',
      activePlayerRole: 'CREATOR',
    });
  });

  it('second call while one is IN_PROGRESS: 200 same id, no new rows created', async () => {
    prismaMock.gameSession.findFirst.mockResolvedValue({
      id: 'session-existing',
      status: 'IN_PROGRESS',
      currentRoundNumber: 2,
      currentQuestionNumber: 3,
      phase: 'ANSWERING',
      activePlayerRole: 'PARTNER',
    } as never);

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: 'session-existing',
      status: 'IN_PROGRESS',
      currentRoundNumber: 2,
      currentQuestionNumber: 3,
      phase: 'ANSWERING',
      activePlayerRole: 'PARTNER',
    });
    expect(prismaMock.gameSession.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(selectQuestionsForRound).not.toHaveBeenCalled();
  });

  it('simulated P2002 on insert falls back to the existing session instead of a 500', async () => {
    prismaMock.gameSession.findFirst
      .mockResolvedValueOnce(null) // pre-create read: nothing in progress yet
      .mockResolvedValueOnce({
        id: 'session-winner',
        status: 'IN_PROGRESS',
        currentRoundNumber: 1,
        currentQuestionNumber: 1,
        phase: 'PASS_DEVICE',
        activePlayerRole: 'CREATOR',
      } as never); // post-P2002 re-read: the concurrent winner's session
    prismaMock.$transaction.mockRejectedValueOnce(p2002(['coupleId']));

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('session-winner');
    expect(prismaMock.gameSession.findFirst).toHaveBeenCalledTimes(2);
  });

  it('rethrows a non-P2002 transaction error', async () => {
    prismaMock.gameSession.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockRejectedValueOnce(new Error('boom'));

    await expect(POST(makeReq())).rejects.toThrow('boom');
  });

  it('returns 401 when unauthenticated', async () => {
    const { NextResponse } = await import('next/server');
    (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(findActivatedCoupleForUser).not.toHaveBeenCalled();
  });

  it('returns 403 when CSRF verification fails', async () => {
    const { NextResponse } = await import('next/server');
    (verifyCsrf as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect(findActivatedCoupleForUser).not.toHaveBeenCalled();
  });

  it("source exports runtime = 'nodejs'", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('withRequestContext');
  });
});

describe('POST /api/games — theme selection', () => {
  // The success path needs the same two mocks every other creating test
  // sets: no session in progress, and a session row to return.
  beforeEach(() => {
    prismaMock.gameSession.findFirst.mockResolvedValue(null);
    prismaMock.gameSession.create.mockResolvedValue({
      id: 'session-1',
      status: 'IN_PROGRESS',
      currentRoundNumber: 1,
      currentQuestionNumber: 1,
      phase: 'PASS_DEVICE',
      activePlayerRole: 'CREATOR',
    } as never);
  });

  function makeReqWith(body: unknown): NextRequest {
    return new NextRequest('http://test/api/games', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
  }

  /** Donne au couple un pack en cours, valable un jour. */
  function avecPack(packId: string) {
    prismaMock.entitlement.findMany.mockResolvedValue([
      { packId, expiresAt: new Date(Date.now() + 86_400_000) },
    ] as never);
  }

  it('passes the chosen themes to every round draw', async () => {
    avecPack('INTEGRAL');
    const res = await POST(makeReqWith({ categories: ['Confiance & Jalousie', 'Ex et passé'] }));
    expect(res.status).toBe(201);
    expect(selectQuestionsForRound).toHaveBeenCalledTimes(3);
    for (const call of (selectQuestionsForRound as unknown as ReturnType<typeof vi.fn>).mock
      .calls) {
      expect(call[1]).toMatchObject({
        categories: ['Confiance & Jalousie', 'Ex et passé'],
      });
    }
  });

  it('still creates a game when no body is sent at all', async () => {
    // Every client that shipped before theme selection sends no body. If a
    // missing body became a 400, "Nouvelle partie" would break for them —
    // which is why the body is parsed with a catch and not required.
    const res = await POST(makeReq());
    expect(res.status).toBe(201);
  });

  // Depuis les paliers, « aucun thème demandé » ne veut plus dire « aucune
  // restriction » : cela veut dire « les thèmes de votre pack ». Sans cela
  // un compte Découverte tirerait dans toute la banque en ne cochant rien,
  // et le palier gratuit n'existerait que sur le papier.
  it('restricts a Découverte couple to its single theme when nothing is asked', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(201);
    const call = (selectQuestionsForRound as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[1]).toMatchObject({ categories: ['Confiance & Jalousie'] });
  });

  it('leaves an Intégral couple unrestricted when nothing is asked', async () => {
    avecPack('INTEGRAL');
    const res = await POST(makeReqWith({ categories: [] }));
    expect(res.status).toBe(201);
    const call = (selectQuestionsForRound as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[1]).not.toHaveProperty('categories');
  });

  it('refuses a theme the pack does not open, rather than dropping it', async () => {
    const res = await POST(makeReqWith({ categories: ['Mode Piment · 18+'] }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('THEME_LOCKED');
    expect(body.themes).toEqual(['Mode Piment · 18+']);
    expect(body.pack).toBe('DECOUVERTE');
    // Rien n'a été tiré : le refus est une porte, pas un filtre.
    expect(selectQuestionsForRound).not.toHaveBeenCalled();
  });

  // THEME_LOCKED reste une regle vivante, mais depuis le 02/10/2026 ce n'est
  // plus un palier payant qui la declenche : les trois packs ouvrent tout le
  // catalogue et ne se distinguent que par la duree. Le seul palier partiel
  // est desormais le gratuit, et c'est lui qui doit tenir ce test — sans quoi
  // le chemin 403 ne serait plus couvert du tout.
  it('refuses a locked theme to a couple on the free tier', async () => {
    prismaMock.entitlement.findMany.mockResolvedValue([] as never);
    const res = await POST(makeReqWith({ categories: ['Projets & Engagement'] }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('THEME_LOCKED');
  });

  // Un cas par pack, et non une boucle : les mocks de creation de session ne
  // repondent qu'une fois par test, donc une boucle echouait sur le deuxieme
  // tour avec « Cannot read properties of undefined » — un faux negatif qui
  // n'apprenait rien sur les paliers.
  it('opens the whole catalogue to the Week-end pack', async () => {
    avecPack('WEEKEND');
    expect((await POST(makeReqWith({ categories: ['Projets & Engagement'] }))).status).toBe(201);
  });

  it('opens the whole catalogue to the Semaine pack', async () => {
    avecPack('ESSENTIEL');
    expect((await POST(makeReqWith({ categories: ['Mode Piment · 18+'] }))).status).toBe(201);
  });

  it('ignores an expired pack', async () => {
    prismaMock.entitlement.findMany.mockResolvedValue([] as never);
    const res = await POST(makeReqWith({ categories: ['Ex et passé'] }));
    expect(res.status).toBe(403);
    expect((await res.json()).pack).toBe('DECOUVERTE');
  });

  // Le défaut le plus coûteux que cette route pourrait avoir : encaisser un
  // pack puis refuser la deuxième partie au nom de la partie offerte.
  it('does not spend the free game when the couple holds a paid pack', async () => {
    avecPack('INTEGRAL');
    const res = await POST(makeReqWith({ categories: ['Ex et passé'] }));
    expect(res.status).toBe(201);
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a malformed theme list rather than silently ignoring it', async () => {
    // Silently dropping a bad selection would start a game about something
    // the couple did not choose, which is worse than an error.
    const res = await POST(makeReqWith({ categories: [123, {}] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_CATEGORIES');
    expect(selectQuestionsForRound).not.toHaveBeenCalled();
  });

  it('rejects an unbounded selection', async () => {
    const res = await POST(
      makeReqWith({ categories: Array.from({ length: 40 }, (_, i) => `t${i}`) }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/games — format', () => {
  beforeEach(() => {
    prismaMock.gameSession.findFirst.mockResolvedValue(null);
    prismaMock.gameSession.create.mockResolvedValue({
      id: 'session-1',
      status: 'IN_PROGRESS',
      currentRoundNumber: 1,
      currentQuestionNumber: 1,
      phase: 'PASS_DEVICE',
      activePlayerRole: 'CREATOR',
    } as never);
  });

  function makeReqWith(body: unknown): NextRequest {
    return new NextRequest('http://test/api/games', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
  }

  function drawCounts(): number[] {
    return (selectQuestionsForRound as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => (c[1] as { count: number }).count,
    );
  }

  it('deals 5/5/5 by default, exactly as before formats existed', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(201);
    expect(drawCounts()).toEqual([5, 5, 5]);
  });

  it('deals 2/2/1 for Express — three manches, never two', async () => {
    // The rule the distribution exists for: a quick game that skipped Face à
    // face would be a different game, not a shorter one.
    const res = await POST(makeReqWith({ format: 'EXPRESS' }));
    expect(res.status).toBe(201);
    expect(drawCounts()).toEqual([2, 2, 1]);
  });

  it('deals 10/10/10 for Longue soirée', async () => {
    const res = await POST(makeReqWith({ format: 'LONGUE_SOIREE' }));
    expect(res.status).toBe(201);
    expect(drawCounts()).toEqual([10, 10, 10]);
  });

  it('refuses an unknown format instead of quietly dealing the default', async () => {
    // A couple who asked for thirty questions must not silently get fifteen.
    const res = await POST(makeReqWith({ format: 'MOYEN' }));
    expect(res.status).toBe(400);
    expect(selectQuestionsForRound).not.toHaveBeenCalled();
  });

  it('accepts a format and themes together', async () => {
    // Un thème acheté, donc un pack qui l'ouvre : depuis les paliers, la
    // longueur et le sujet sont deux décisions indépendantes, et il faut
    // que les deux passent ensemble.
    prismaMock.entitlement.findMany.mockResolvedValue([
      { packId: 'INTEGRAL', expiresAt: new Date(Date.now() + 86_400_000) },
    ] as never);

    const res = await POST(makeReqWith({ format: 'EXPRESS', categories: ['Ex et passé'] }));
    expect(res.status).toBe(201);
    expect(drawCounts()).toEqual([2, 2, 1]);
    const first = (selectQuestionsForRound as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(first?.[1]).toMatchObject({ categories: ['Ex et passé'] });
  });
});

// ── The one free game ───────────────────────────────────────────────
//
// Product rule: one free game per ACCOUNT, claimed when a session is
// created. Everything worth getting wrong here is a way to hand out a
// second free game — or to charge for one that never started.
describe('POST /api/games — the free game', () => {
  beforeEach(() => {
    prismaMock.gameSession.findFirst.mockResolvedValue(null);
    prismaMock.gameSession.create.mockResolvedValue({
      id: 'session-1',
      status: 'IN_PROGRESS',
      currentRoundNumber: 1,
      currentQuestionNumber: 1,
      phase: 'PASS_DEVICE',
      activePlayerRole: 'CREATOR',
    } as never);
  });

  it('claims the free game when a session is actually created', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(201);

    const claim = prismaMock.user.updateMany.mock.calls[0]?.[0];
    // Conditional on the column still being null: two tabs pressing at
    // once must not both pass. A read-then-write would let them.
    expect(claim?.where).toEqual({ id: 'user-1', freeGameUsedAt: null });
    expect(claim?.data?.freeGameUsedAt).toBeInstanceOf(Date);
  });

  it('refuses a second game once the claim finds nothing to update', async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 } as never);

    const res = await POST(makeReq());
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe('FREE_GAME_USED');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(selectQuestionsForRound).not.toHaveBeenCalled();
  });

  it('never charges for resuming a game already in progress', async () => {
    // The defect this pins: putting the claim before the resume check
    // would spend an entitlement every time a player reloads mid-game.
    prismaMock.gameSession.findFirst.mockResolvedValue({
      id: 'session-existing',
      status: 'IN_PROGRESS',
      currentRoundNumber: 2,
      currentQuestionNumber: 3,
      phase: 'ANSWERING',
      activePlayerRole: 'PARTNER',
    } as never);

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('gives the claim back when the creation fails', async () => {
    // Otherwise the account is charged for a game that does not exist and
    // cannot be resumed — the worst of both outcomes.
    prismaMock.$transaction.mockRejectedValueOnce(new Error('boom'));

    await expect(POST(makeReq())).rejects.toThrow('boom');
    const claim = prismaMock.user.updateMany.mock.calls[0]?.[0];
    const release = prismaMock.user.updateMany.mock.calls[1]?.[0];
    expect(release?.data).toEqual({ freeGameUsedAt: null });
    // Scoped to the very timestamp this request wrote. An unconditional
    // release would also clear a claim a LATER request had just made,
    // handing that account a second free game.
    expect(release?.where).toEqual({ id: 'user-1', freeGameUsedAt: claim?.data?.freeGameUsedAt });
  });

  it('gives the claim back when a concurrent writer won the race', async () => {
    // This request returns the winner's session and created nothing, so
    // it owes nothing.
    prismaMock.gameSession.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'session-winner',
      status: 'IN_PROGRESS',
      currentRoundNumber: 1,
      currentQuestionNumber: 1,
      phase: 'PASS_DEVICE',
      activePlayerRole: 'CREATOR',
    } as never);
    prismaMock.$transaction.mockRejectedValueOnce(p2002(['coupleId']));

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(prismaMock.user.updateMany.mock.calls[1]?.[0]?.data).toEqual({ freeGameUsedAt: null });
  });

  it('skips the rule entirely for an exempt address', async () => {
    process.env.FREE_GAME_EXEMPT_EMAILS = 'awa@example.com';
    // Even with the claim already spent, an exempt caller plays on.
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 } as never);

    const res = await POST(makeReq());
    expect(res.status).toBe(201);
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('does not exempt an address that is merely similar', async () => {
    process.env.FREE_GAME_EXEMPT_EMAILS = 'awa@example.com.attacker.test';
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 } as never);

    const res = await POST(makeReq());
    expect(res.status).toBe(402);
  });
});
