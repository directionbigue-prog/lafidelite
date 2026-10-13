import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { POST } from './route';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { positionDepart } from '@/lib/dames/etat';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/salon', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

const COUPLE = { id: 'couple-1', creatorId: 'user-1', partnerId: 'user-2' };

beforeEach(() => {
  vi.clearAllMocks();
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
  prismaMock.couple.findFirst.mockResolvedValue(COUPLE as never);
  // Le Salon est inclus dans les packs payants. Le couple par défaut de ce
  // fichier en détient un : les tests qui suivent portent sur les règles du
  // Salon, pas sur la facturation, et leur faire traverser un 403 à chaque
  // fois n'apprendrait rien de plus. Le refus a son propre cas, plus bas.
  prismaMock.entitlement.findMany.mockResolvedValue([
    { packId: 'ESSENTIEL', expiresAt: new Date(Date.now() + 86_400_000) },
  ] as never);
});

describe('POST /api/salon', () => {
  it('crée une partie de dames à la position de départ', async () => {
    prismaMock.boardGame.findFirst.mockResolvedValue(null);
    prismaMock.boardGame.create.mockImplementation((async (args: {
      data: { state: { trait: string } };
    }) => ({
      id: 'bg-1',
      kind: 'DAMES',
      status: 'IN_PROGRESS',
      state: args.data.state,
      moveCount: 0,
    })) as never);

    const res = await POST(makeReq({ kind: 'DAMES' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('bg-1');
    // Les blancs ouvrent, et le plateau est complet.
    expect(body.state.trait).toBe('blanc');
    expect(body.state.cases).toHaveLength(50);
  });

  it('renvoie la partie en cours au lieu d’en créer une seconde', async () => {
    prismaMock.boardGame.findFirst.mockResolvedValue({
      id: 'bg-existant',
      kind: 'DAMES',
      status: 'IN_PROGRESS',
      state: { ...positionDepart(), trait: 'noir' },
      moveCount: 12,
    } as never);

    const res = await POST(makeReq({ kind: 'DAMES' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('bg-existant');
    expect(body.moveCount).toBe(12);
    expect(body.state.cases).toHaveLength(50);
    expect(body.state.trait).toBe('noir');
    expect(prismaMock.boardGame.create).not.toHaveBeenCalled();
  });

  it('ne laisse pas sortir un état que le schéma du jeu refuse', async () => {
    // Les deux branches qui LISENT la base (`existante` ici, `gagnante`
    // dans la course plus bas) rendaient le `state` brut. `null` dit au
    // client de repartir de la position de départ — même règle que
    // GET /api/salon/current, pour que les deux routes qui rendent une
    // partie accordent la même confiance à la base : aucune.
    prismaMock.boardGame.findFirst.mockResolvedValue({
      id: 'bg-existant',
      kind: 'DAMES',
      status: 'IN_PROGRESS',
      state: { cases: [], trait: 'noir' },
      moveCount: 12,
    } as never);

    const res = await POST(makeReq({ kind: 'DAMES' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('bg-existant');
    expect(body.state).toBeNull();
  });

  it('refuse un jeu inconnu', async () => {
    const res = await POST(makeReq({ kind: 'ECHECS' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_KIND');
  });

  it('range la partie d’un couple actif sous le couple, jamais sous le compte', async () => {
    prismaMock.boardGame.findFirst.mockResolvedValue(null);
    prismaMock.boardGame.create.mockResolvedValue({
      id: 'bg-1',
      kind: 'DAMES',
      status: 'IN_PROGRESS',
      state: positionDepart(),
      moveCount: 0,
    } as never);

    await POST(makeReq({ kind: 'DAMES' }));
    const { data } = prismaMock.boardGame.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(data.coupleId).toBe('couple-1');
    expect(data).not.toHaveProperty('userId');
  });

  describe('compte sans couple actif (depuis le 13/10/2026)', () => {
    beforeEach(() => {
      prismaMock.couple.findFirst.mockResolvedValue(null);
    });

    it('ouvre le Salon et range la partie sous le compte', async () => {
      prismaMock.boardGame.findFirst.mockResolvedValue(null);
      prismaMock.boardGame.create.mockResolvedValue({
        id: 'bg-solo',
        kind: 'DAMES',
        status: 'IN_PROGRESS',
        state: positionDepart(),
        moveCount: 0,
      } as never);

      const res = await POST(makeReq({ kind: 'DAMES' }));
      expect(res.status).toBe(201);
      expect((await res.json()).id).toBe('bg-solo');

      const { data } = prismaMock.boardGame.create.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      expect(data.userId).toBe('user-1');
      // Un seul propriétaire : la contrainte CHECK refuserait les deux.
      expect(data).not.toHaveProperty('coupleId');
    });

    it('cherche la partie en cours parmi les SIENNES seulement', async () => {
      prismaMock.boardGame.findFirst.mockResolvedValue(null);
      prismaMock.boardGame.create.mockResolvedValue({
        id: 'bg-solo',
        kind: 'DAMES',
        status: 'IN_PROGRESS',
        state: positionDepart(),
        moveCount: 0,
      } as never);

      await POST(makeReq({ kind: 'DAMES' }));
      const { where } = prismaMock.boardGame.findFirst.mock.calls[0]![0] as {
        where: Record<string, unknown>;
      };
      expect(where).toMatchObject({ userId: 'user-1', coupleId: null, status: 'IN_PROGRESS' });
    });

    it('décide de l’accès sur son seul pack', async () => {
      prismaMock.boardGame.findFirst.mockResolvedValue(null);
      prismaMock.boardGame.create.mockResolvedValue({
        id: 'bg-solo',
        kind: 'DAMES',
        status: 'IN_PROGRESS',
        state: positionDepart(),
        moveCount: 0,
      } as never);

      await POST(makeReq({ kind: 'DAMES' }));
      const { where } = prismaMock.entitlement.findMany.mock.calls[0]![0] as {
        where: { userId: unknown };
      };
      expect(where.userId).toEqual({ in: ['user-1'] });
    });

    it('lui refuse le Salon sans pack payant, comme à un couple', async () => {
      prismaMock.entitlement.findMany.mockResolvedValue([] as never);
      const res = await POST(makeReq({ kind: 'DAMES' }));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('SALON_LOCKED');
      expect(prismaMock.boardGame.create).not.toHaveBeenCalled();
    });

    it('rattrape la course sur l’index du compte (deux onglets, même seconde)', async () => {
      prismaMock.boardGame.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'bg-gagnant',
        kind: 'DAMES',
        status: 'IN_PROGRESS',
        state: positionDepart(),
        moveCount: 0,
      } as never);
      prismaMock.boardGame.create.mockRejectedValue(p2002(['userId', 'kind']));

      const res = await POST(makeReq({ kind: 'DAMES' }));
      expect(res.status).toBe(200);
      expect((await res.json()).id).toBe('bg-gagnant');
    });
  });

  it('ne touche jamais au score du couple ni à la partie offerte', async () => {
    prismaMock.boardGame.findFirst.mockResolvedValue(null);
    prismaMock.boardGame.create.mockResolvedValue({
      id: 'bg-1',
      kind: 'DAMES',
      status: 'IN_PROGRESS',
      state: {},
      moveCount: 0,
    } as never);

    await POST(makeReq({ kind: 'DAMES' }));
    // Un divertissement n'alimente aucun score et ne coûte pas la partie
    // offerte — même depuis que le Salon est réservé aux packs payants :
    // il est INCLUS dans le pack, il ne se paie pas une seconde fois.
    expect(prismaMock.couple.update).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('refuse le Salon au palier Découverte', async () => {
    prismaMock.entitlement.findMany.mockResolvedValue([] as never);

    const res = await POST(makeReq({ kind: 'DAMES' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('SALON_LOCKED');
    expect(body.pack).toBe('DECOUVERTE');
    // La porte est posée AVANT toute écriture : rien n'a été créé.
    expect(prismaMock.boardGame.create).not.toHaveBeenCalled();
  });

  it('ouvre le Salon à chacun des trois packs payants', async () => {
    for (const packId of ['ESSENTIEL', 'INTEGRAL', 'ANNUEL']) {
      prismaMock.entitlement.findMany.mockResolvedValue([
        { packId, expiresAt: new Date(Date.now() + 86_400_000) },
      ] as never);
      prismaMock.boardGame.findFirst.mockResolvedValue(null);
      prismaMock.boardGame.create.mockResolvedValue({
        id: `bg-${packId}`,
        kind: 'DAMES',
        status: 'IN_PROGRESS',
        state: positionDepart(),
        moveCount: 0,
      } as never);

      const res = await POST(makeReq({ kind: 'DAMES' }));
      expect(res.status, `pack ${packId}`).toBe(201);
    }
  });

  it('refuse le Salon quand le pack a expiré', async () => {
    prismaMock.entitlement.findMany.mockResolvedValue([] as never);
    const res = await POST(makeReq({ kind: 'DAMES' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('SALON_LOCKED');
  });

  it('rattrape la course : le perdant du P2002 reçoit la partie du gagnant, pas une erreur', async () => {
    // Les deux membres du couple ouvrent le Salon dans la même seconde.
    // Notre lecture ne voit encore aucune partie IN_PROGRESS...
    prismaMock.boardGame.findFirst
      .mockResolvedValueOnce(null)
      // ...mais notre `create` perd la course contre l'index unique partiel
      // BoardGame_couple_kind_in_progress_unique — l'autre l'a emporté.
      .mockResolvedValueOnce({
        id: 'bg-gagnant',
        kind: 'DAMES',
        status: 'IN_PROGRESS',
        state: { cases: [], trait: 'blanc' },
        moveCount: 0,
      } as never);
    prismaMock.boardGame.create.mockRejectedValue(p2002(['coupleId', 'kind']));

    const res = await POST(makeReq({ kind: 'DAMES' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('bg-gagnant');
    // La partie du gagnant est LUE en base, donc elle passe elle aussi par
    // le schéma du jeu : le plateau mocké ici est invalide (zéro case), il
    // sort à `null` et non tel quel.
    expect(body.state).toBeNull();
    expect(prismaMock.boardGame.findFirst).toHaveBeenCalledTimes(2);
  });

  it('renvoie 401 quand l’appelant n’est pas authentifié, avant tout accès à la base', async () => {
    const { NextResponse } = await import('next/server');
    (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );

    const res = await POST(makeReq({ kind: 'DAMES' }));
    expect(res.status).toBe(401);
    expect(prismaMock.couple.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.boardGame.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.boardGame.create).not.toHaveBeenCalled();
  });

  it('renvoie 403 quand le CSRF est invalide, avant tout accès à la base', async () => {
    const { NextResponse } = await import('next/server');
    (verifyCsrf as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );

    const res = await POST(makeReq({ kind: 'DAMES' }));
    expect(res.status).toBe(403);
    expect(requireAuth).not.toHaveBeenCalled();
    expect(prismaMock.couple.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.boardGame.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.boardGame.create).not.toHaveBeenCalled();
  });
});
