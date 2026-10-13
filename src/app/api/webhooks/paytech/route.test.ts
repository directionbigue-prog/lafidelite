import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { PACKS_PAYANTS } from '@/lib/game/packs';

const m = vi.hoisted(() => ({
  logFind: vi.fn(),
  logCreate: vi.fn(),
  logUpdate: vi.fn(),
  orderFind: vi.fn(),
  orderUpdate: vi.fn(),
  orderUpdateMany: vi.fn(),
  entFind: vi.fn(),
  entCreate: vi.fn(),
  outbox: vi.fn(),
}));

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        webhookLog: { findUnique: m.logFind, create: m.logCreate, update: m.logUpdate },
        order: { findUnique: m.orderFind, update: m.orderUpdate, updateMany: m.orderUpdateMany },
        entitlement: { findUnique: m.entFind, create: m.entCreate },
        outboxEvent: { create: m.outbox },
      }),
    ),
  },
}));

import { POST } from './route';

const KEY = 'cle-test';
const SECRET = 'secret-test';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const pack = PACKS_PAYANTS[0]!;

function ipn(champs: Record<string, string>) {
  return new NextRequest('https://coeurfidele.test/api/webhooks/paytech', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(champs).toString(),
  });
}

const signe = (extra: Record<string, string> = {}) =>
  ipn({
    type_event: 'sale_complete',
    ref_command: 'order-1',
    token: 'T_1',
    item_price: String(pack.prix),
    currency: 'XOF',
    env: 'prod',
    payment_method: 'Wave',
    api_key_sha256: sha(KEY),
    api_secret_sha256: sha(SECRET),
    ...extra,
  });

beforeEach(() => {
  vi.stubEnv('PAYTECH_API_KEY', KEY);
  vi.stubEnv('PAYTECH_API_SECRET', SECRET);
  vi.stubEnv('PAYTECH_ENV', 'prod');
  for (const f of Object.values(m)) f.mockReset();
  m.logFind.mockResolvedValue(null);
  m.entFind.mockResolvedValue(null);
  m.orderFind.mockResolvedValue({
    id: 'order-1',
    userId: 'u1',
    provider: 'paytech',
    providerChargeId: 'T_1',
    status: 'PENDING',
    amount: pack.prix,
    currency: 'XOF',
    customerEmail: null,
    metadata: { packId: pack.id },
  });
});

afterEach(() => vi.unstubAllEnvs());

describe('POST /api/webhooks/paytech', () => {
  it('un paiement confirmé et signé ouvre le pack, une fois', async () => {
    const res = await POST(signe());
    expect(res.status).toBe(200);
    expect(m.orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAID', paymentMethod: 'Wave' }),
      }),
    );
    expect(m.entCreate).toHaveBeenCalledTimes(1);
    expect(m.entCreate.mock.calls[0]![0].data).toMatchObject({
      userId: 'u1',
      packId: pack.id,
      orderId: 'order-1',
    });
    // Les empreintes des clés ne sont jamais stockées dans WebhookLog.
    expect(JSON.stringify(m.logCreate.mock.calls[0]![0])).not.toContain(sha(KEY));
  });

  it('refuse une signature fausse : 401, rien d’ouvert', async () => {
    const res = await POST(signe({ api_secret_sha256: sha('autre') }));
    expect(res.status).toBe(401);
    expect(m.entCreate).not.toHaveBeenCalled();
  });

  it('un paiement de TEST n’ouvre jamais un vrai pack', async () => {
    await POST(signe({ env: 'test' }));
    expect(m.orderUpdate).not.toHaveBeenCalled();
    expect(m.entCreate).not.toHaveBeenCalled();
  });

  it('un montant qui ne correspond pas n’ouvre rien', async () => {
    await POST(signe({ item_price: '100' }));
    expect(m.entCreate).not.toHaveBeenCalled();
  });

  it('un jeton qui n’est pas celui de la commande n’ouvre rien', async () => {
    await POST(signe({ token: 'T_autre' }));
    expect(m.entCreate).not.toHaveBeenCalled();
  });

  it('une annulation passe la commande en échec sans toucher à une commande payée', async () => {
    await POST(signe({ type_event: 'sale_canceled' }));
    expect(m.orderUpdateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: { not: 'PAID' } },
      data: { status: 'FAILED' },
    });
  });
});
