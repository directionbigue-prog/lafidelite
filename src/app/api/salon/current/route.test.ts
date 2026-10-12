import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

import { GET } from './route';
import { requireAuth } from '@/lib/server/middleware';
import { positionDepart } from '@/lib/dames/etat';

function makeReq(kind = 'DAMES'): NextRequest {
  return new NextRequest(`http://test/api/salon/current?kind=${kind}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
  prismaMock.couple.findFirst.mockResolvedValue({
    id: 'couple-1',
    creatorId: 'user-1',
    partnerId: 'user-2',
  } as never);
});

describe('GET /api/salon/current', () => {
  it('renvoie la partie en cours, plateau compris', async () => {
    prismaMock.boardGame.findFirst.mockResolvedValue({
      id: 'bg-1',
      kind: 'DAMES',
      status: 'IN_PROGRESS',
      state: positionDepart(),
      moveCount: 4,
    } as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const { game } = await res.json();
    expect(game.id).toBe('bg-1');
    expect(game.moveCount).toBe(4);
    expect(game.state.cases).toHaveLength(50);
    expect(game.state.trait).toBe('blanc');
  });

  it('ne laisse pas sortir un état que le schéma du jeu refuse', async () => {
    // Cette route rendait le `state` brut de la base. Un plateau corrompu
    // (ici : zéro case au lieu de 50) traversait donc jusqu'à l'écran,
    // alors que c'est exactement ce que `etat-schema.ts` existe pour
    // arrêter. `null` dit au client de repartir de la position de départ.
    //
    // `POST /api/salon` avait le même trou sur ses deux branches qui
    // lisent la base ; il est bouché de la même façon, et testé là-bas.
    prismaMock.boardGame.findFirst.mockResolvedValue({
      id: 'bg-1',
      kind: 'DAMES',
      status: 'IN_PROGRESS',
      state: { cases: [], trait: 'blanc' },
      moveCount: 4,
    } as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const { game } = await res.json();
    expect(game.id).toBe('bg-1');
    expect(game.state).toBeNull();
  });

  it('renvoie null quand il n’y a pas de partie en cours', async () => {
    prismaMock.boardGame.findFirst.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect((await res.json()).game).toBeNull();
  });

  it('refuse un jeu inconnu', async () => {
    const res = await GET(makeReq('ECHECS'));
    expect(res.status).toBe(400);
  });

  it('renvoie 401 quand l’appelant n’est pas authentifié, avant tout accès à la base', async () => {
    const { NextResponse } = await import('next/server');
    (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );

    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(prismaMock.couple.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.boardGame.findFirst).not.toHaveBeenCalled();
  });
});
