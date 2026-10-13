import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { POST } from './route';
import { requireAuth } from '@/lib/server/middleware';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/salon/bg-1/end', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const params = Promise.resolve({ id: 'bg-1' });

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
  prismaMock.boardGame.findFirst.mockResolvedValue({
    id: 'bg-1',
    coupleId: 'couple-1',
    status: 'IN_PROGRESS',
  } as never);
});

describe('POST /api/salon/[id]/end', () => {
  it('termine une partie', async () => {
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 1 } as never);
    const res = await POST(makeReq({ outcome: 'COMPLETED' }), { params });
    expect(res.status).toBe(200);
    const data = prismaMock.boardGame.updateMany.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({ status: 'COMPLETED' });
  });

  it('accepte un abandon', async () => {
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 1 } as never);
    const res = await POST(makeReq({ outcome: 'ABANDONED' }), { params });
    expect(res.status).toBe(200);
  });

  it('refuse une issue inconnue', async () => {
    const res = await POST(makeReq({ outcome: 'GAGNE' }), { params });
    expect(res.status).toBe(400);
  });

  it('reste sans effet sur une partie déjà terminée', async () => {
    // Le `where` filtre sur IN_PROGRESS : terminer deux fois est sans
    // conséquence, ce qui rend l'appel sûr à rejouer.
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 0 } as never);
    const res = await POST(makeReq({ outcome: 'COMPLETED' }), { params });
    expect(res.status).toBe(200);
  });

  it('emporte le couple jusque dans l’écriture, pas seulement dans la lecture', async () => {
    // Défense en profondeur, pas une faille : `id` est la clé primaire, il
    // vient du segment de route, et rien ne réaffecte un `coupleId`. Mais
    // l'écriture ne doit pas dépendre du `findFirst` qui la précède pour
    // être correcte — c'est ce motif-là qui sera recopié pour le ludo.
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 1 } as never);
    await POST(makeReq({ outcome: 'COMPLETED' }), { params });
    const where = prismaMock.boardGame.updateMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ id: 'bg-1', coupleId: 'couple-1', status: 'IN_PROGRESS' });
  });

  it('termine la partie d’un compte seul, bornée à SON compte', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(null);
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 1 } as never);
    const res = await POST(makeReq({ outcome: 'COMPLETED' }), { params });
    expect(res.status).toBe(200);
    const lecture = prismaMock.boardGame.findFirst.mock.calls[0]?.[0]?.where;
    expect(lecture).toMatchObject({ id: 'bg-1', userId: 'user-1', coupleId: null });
    const ecriture = prismaMock.boardGame.updateMany.mock.calls[0]?.[0]?.where;
    expect(ecriture).toMatchObject({ id: 'bg-1', userId: 'user-1', coupleId: null });
  });

  it('n’écrit jamais vers le score du couple', async () => {
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 1 } as never);
    await POST(makeReq({ outcome: 'COMPLETED' }), { params });
    expect(prismaMock.couple.update).not.toHaveBeenCalled();
  });
});
