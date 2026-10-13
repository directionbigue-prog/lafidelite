import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const appel = (id: string) =>
  GET(new NextRequest(`http://test/api/orders/${id}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.sn' } } as never);
  prismaMock.entitlement.findUnique.mockResolvedValue(null);
});

describe('GET /api/orders/[id]', () => {
  it('ne lit que les commandes du compte', async () => {
    prismaMock.order.findFirst.mockResolvedValue(null);
    expect((await appel('o-autrui')).status).toBe(404);
    expect(prismaMock.order.findFirst.mock.calls[0]![0]!.where).toEqual({
      id: 'o-autrui',
      userId: 'u1',
    });
  });

  it('« derniere » rend la commande la plus récente du compte', async () => {
    prismaMock.order.findFirst.mockResolvedValue({
      id: 'o9',
      status: 'PENDING',
      amount: 2000,
      currency: 'XOF',
      metadata: { packId: 'WEEKEND' },
    } as never);
    const res = await appel('derniere');
    expect(res.status).toBe(200);
    const args = prismaMock.order.findFirst.mock.calls[0]![0]!;
    expect(args.where).toEqual({ userId: 'u1' });
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect((await res.json()).id).toBe('o9');
  });
});
