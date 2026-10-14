import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bictorysFixtureRequest } from '@/test-utils/bictorys-mock';

const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();
const orderFindFirst = vi.fn();
const orderUpdate = vi.fn();
const outboxCreate = vi.fn();
const entFindUnique = vi.fn();
const entCreate = vi.fn();

const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>, _opts?: unknown) =>
  fn({
    webhookLog: { findUnique, create, update },
    order: { findFirst: orderFindFirst, update: orderUpdate },
    outboxEvent: { create: outboxCreate },
    entitlement: { findUnique: entFindUnique, create: entCreate },
  }),
);

vi.mock('@/lib/server/prisma', () => ({
  prisma: { $transaction },
}));

beforeEach(() => {
  vi.stubEnv('BICTORYS_API_URL', 'https://api.bictorys.test');
  vi.stubEnv('BICTORYS_API_KEY', 'test-api-key');
  vi.stubEnv('BICTORYS_WEBHOOK_SECRET', 'test-webhook-secret');
  vi.stubEnv('BICTORYS_WEBHOOK_REPLAY_WINDOW_MS', '60000');
  findUnique.mockReset();
  create.mockReset();
  update.mockReset();
  orderFindFirst.mockReset();
  orderUpdate.mockReset();
  outboxCreate.mockReset();
  entFindUnique.mockReset();
  entCreate.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/webhooks/bictorys', () => {
  // Production runs on PayTech and carries no BICTORYS_* variable. Every
  // anonymous POST here used to throw inside the provider's lazy init and
  // come back as a bare 500 — found by probing production on 2026-10-14.
  it('answers 503 WEBHOOK_NOT_CONFIGURED, without a transaction, when Bictorys is not configured', async () => {
    const { req } = bictorysFixtureRequest({ status: 'succeeded' });
    vi.stubEnv('BICTORYS_WEBHOOK_SECRET', '');
    const { POST } = await import('./route');
    const res = await POST(req);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('WEBHOOK_NOT_CONFIGURED');
    expect($transaction).not.toHaveBeenCalled();
  });

  it('valid HMAC + first delivery returns 200 deduped:false (WH-01)', async () => {
    findUnique.mockResolvedValueOnce(null); // no existing WebhookLog row
    orderFindFirst.mockResolvedValueOnce(null); // unknown charge — onPaid drops
    const { POST } = await import('./route');
    const { req } = bictorysFixtureRequest({ status: 'succeeded' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deduped: false });
    expect(create).toHaveBeenCalled(); // WebhookLog row inserted
  });

  it('replay of same (externalId, eventType) returns deduped:true (WH-02)', async () => {
    findUnique.mockResolvedValueOnce({ id: 'wl1', processedAt: new Date() });
    const { POST } = await import('./route');
    const { req } = bictorysFixtureRequest({ status: 'succeeded' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deduped: true });
    expect(create).not.toHaveBeenCalled(); // no new row written
  });

  it('tampered body returns 401', async () => {
    const { rawBody, headers } = (await import('@/test-utils/bictorys-mock')).bictorysFixture({
      status: 'succeeded',
    });
    const tampered = Buffer.from(rawBody.toString('utf8').replace('succeeded', 'failed'));
    const { POST } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost/api/webhooks/bictorys', {
      method: 'POST',
      headers,
      body: tampered,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('expired replay window (drift > 60s) returns 401', async () => {
    const { POST } = await import('./route');
    const { req } = bictorysFixtureRequest({
      status: 'succeeded',
      timestamp: Date.now() - 70_000, // 70s old
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('onPaid enqueues outbox event when order is found (WH-02 — outbox-not-closures)', async () => {
    findUnique.mockResolvedValueOnce(null);
    orderFindFirst.mockResolvedValueOnce({
      id: 'o1',
      userId: 'u1',
      customerEmail: 'a@b.com',
      amount: 1000,
      currency: 'XOF',
    });
    outboxCreate.mockResolvedValue({ id: 'ob1' });
    const { POST } = await import('./route');
    const { req } = bictorysFixtureRequest({ status: 'succeeded' });
    await POST(req);
    expect(outboxCreate).toHaveBeenCalled();
    // Assert at least one outbox row's kind starts with 'notification.' or 'email.'
    const kinds = outboxCreate.mock.calls.map(
      (c) => (c[0] as { data: { kind: string } }).data.kind,
    );
    expect(
      kinds.some(
        (k) => k === 'notification.payment_received' || k === 'email.payment_confirmation',
      ),
    ).toBe(true);
  });

  it('ouvre le pack d’une commande payée au prix du registre, une seule fois', async () => {
    const { PACKS_PAYANTS } = await import('@/lib/game/packs');
    const pack = PACKS_PAYANTS[0]!;
    findUnique.mockResolvedValueOnce(null);
    orderFindFirst.mockResolvedValueOnce({
      id: 'o2',
      userId: 'u1',
      customerEmail: null,
      amount: pack.prix,
      currency: pack.devise,
      metadata: { packId: pack.id },
    });
    entFindUnique.mockResolvedValueOnce(null);
    const { POST } = await import('./route');
    const { req } = bictorysFixtureRequest({ status: 'succeeded' });
    await POST(req);
    expect(entCreate).toHaveBeenCalledTimes(1);
    const data = (entCreate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ userId: 'u1', packId: pack.id, orderId: 'o2' });
    expect(data.expiresAt).toBeInstanceOf(Date);
  });

  it('n’ouvre rien pour une commande sans pack, ni deux fois la même', async () => {
    findUnique.mockResolvedValueOnce(null);
    orderFindFirst.mockResolvedValueOnce({
      id: 'o3',
      userId: 'u1',
      customerEmail: null,
      amount: 1000,
      currency: 'XOF',
      metadata: null,
    });
    const { POST } = await import('./route');
    await POST(bictorysFixtureRequest({ status: 'succeeded' }).req);
    expect(entCreate).not.toHaveBeenCalled();

    const { PACKS_PAYANTS } = await import('@/lib/game/packs');
    const pack = PACKS_PAYANTS[0]!;
    findUnique.mockResolvedValueOnce(null);
    orderFindFirst.mockResolvedValueOnce({
      id: 'o4',
      userId: 'u1',
      customerEmail: null,
      amount: pack.prix,
      currency: pack.devise,
      metadata: { packId: pack.id },
    });
    entFindUnique.mockResolvedValueOnce({ id: 'deja' });
    await POST(bictorysFixtureRequest({ status: 'succeeded' }).req);
    expect(entCreate).not.toHaveBeenCalled();
  });

  it('exports runtime=nodejs and dynamic=force-dynamic (WH-01)', async () => {
    const mod = (await import('./route')) as { runtime?: string; dynamic?: string };
    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
  });
});
