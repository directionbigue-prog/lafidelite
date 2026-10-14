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

  it('rend TOUS les pays connectés, triés, chacun avec son drapeau', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(superadmin);
    // Huit pays : le tableau de bord n'en montrait que six, le reste fondu
    // dans « Autres ». Le `pays` absent compte aussi, sous « Pays inconnu ».
    const lignes = [
      ['FR', 40],
      ['SN', 900],
      ['CI', 30],
      ['ML', 12],
      ['US', 9],
      ['GM', 7],
      ['MA', 5],
      [null, 3],
    ] as const;
    // Même cast que le `beforeEach` : la signature générique de `groupBy`
    // est trop riche pour que `mockResolvedValue` s'y infère.
    (
      prismaMock.connexionEvent.groupBy as unknown as {
        mockResolvedValue: (v: unknown) => void;
      }
    ).mockResolvedValue(lignes.map(([pays, n]) => ({ pays, _count: { _all: n } })));

    const body = await (await GET(req())).json();
    expect(prismaMock.connexionEvent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['pays'] }),
    );
    expect(body.paysConnectes).toHaveLength(8);
    expect(body.paysConnectes.map((p: { cle: string }) => p.cle)).toEqual([
      'SN',
      'FR',
      'CI',
      'ML',
      'US',
      'GM',
      'MA',
      '',
    ]);
    expect(body.paysConnectes[0]).toMatchObject({ libelle: 'Sénégal', drapeau: '🇸🇳', nombre: 900 });
    expect(body.paysConnectes[7]).toMatchObject({ libelle: 'Pays inconnu', nombre: 3 });
  });
});
