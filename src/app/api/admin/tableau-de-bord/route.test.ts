import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';

const superadmin = {
  user: { sub: 'sa', email: 'sa@test.local' },
  admin: { id: 'sa', email: 'sa@test.local', role: 'SUPERADMIN' as const },
};

const req = () => new NextRequest('http://test/api/admin/tableau-de-bord');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceAdminRateLimit).mockResolvedValue(null);
  for (const modele of [
    'user',
    'couple',
    'gameSession',
    'gameResult',
    'boardGame',
    'reponseDuJour',
    'order',
    'entitlement',
    'emailJob',
    'outboxEvent',
    'connexionEvent',
  ] as const) {
    const m = prismaMock[modele] as unknown as Record<
      string,
      { mockResolvedValue: (v: unknown) => void }
    >;
    m.count?.mockResolvedValue(0);
    m.groupBy?.mockResolvedValue([]);
    m.findMany?.mockResolvedValue([]);
  }
});

describe('GET /api/admin/tableau-de-bord', () => {
  it('exige le rôle SUPERADMIN, et ne lit rien quand il est refusé', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(
      NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }),
    );
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(requireAdmin).toHaveBeenCalledWith('SUPERADMIN');
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });

  it('signale un paiement de pack reçu sans droit ouvert', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(superadmin);
    prismaMock.order.findMany.mockResolvedValue([
      {
        id: 'o-ok',
        amount: 4900,
        currency: 'XOF',
        metadata: { packId: 'ESSENTIEL' },
        paidAt: new Date(),
        paymentMethod: 'WAVE',
      },
      {
        id: 'o-orpheline',
        amount: 9900,
        currency: 'XOF',
        metadata: { packId: 'INTEGRAL' },
        paidAt: new Date(),
        paymentMethod: 'ORANGE_MONEY',
      },
    ] as never);
    prismaMock.entitlement.findMany.mockResolvedValue([{ orderId: 'o-ok' }] as never);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alertes.payeesSansDroit).toEqual(['o-orpheline']);
    expect(body.ventes.montantTotal).toBe(14800);
    expect(body.series.inscriptions).toHaveLength(14);
  });
});
