import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/cron/auth', () => ({ verifyCronSecret: vi.fn(() => null) }));
vi.mock('@/lib/server/leader-lease', () => ({
  withLease: vi.fn(async (_r: unknown, _n: string, _t: number, fn: () => Promise<void>) => fn()),
}));
vi.mock('@/lib/server/redis', () => ({ redis: null }));

const deleteMany = vi.fn();
// Deux tables sont purgées par ce créneau quotidien depuis 2026-10-02 :
// WebhookLog, et ConnexionEvent avec sa propre rétention. Les mocks sont
// SÉPARÉS — un seul `deleteMany` partagé laisserait `mock.calls[0]` désigner
// l'un ou l'autre selon l'ordre du handler, et les assertions sur le seuil de
// rétention deviendraient silencieusement vraies pour la mauvaise table.
const deleteManyConnexions = vi.fn();
vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    webhookLog: { deleteMany },
    connexionEvent: { deleteMany: deleteManyConnexions },
  },
}));

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  deleteMany.mockReset();
  deleteManyConnexions.mockReset();
  deleteManyConnexions.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function makeReq(name: string): NextRequest {
  return new NextRequest(`http://localhost/api/cron/${name}`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('POST /api/cron/webhook-log-purge (CRON-05, CRON-06)', () => {
  it('returns 401 when verifyCronSecret fails (CRON-06)', async () => {
    const { verifyCronSecret } = await import('@/lib/server/cron/auth');
    (verifyCronSecret as Mock).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const { POST } = await import('./route');
    const res = await POST(makeReq('webhook-log-purge'));
    expect(res.status).toBe(401);
  });

  it('deletes webhook logs older than retention (CRON-05)', async () => {
    deleteMany.mockResolvedValueOnce({ count: 4 });
    vi.stubEnv('WEBHOOK_LOG_RETENTION_DAYS', '30');
    const { POST } = await import('./route');
    const res = await POST(makeReq('webhook-log-purge'));
    expect(res.status).toBe(200);
    expect(deleteMany).toHaveBeenCalled();
    const where = (deleteMany.mock.calls[0]![0] as { where: { createdAt: { lt: Date } } }).where;
    expect(where.createdAt.lt).toBeInstanceOf(Date);
    // Cutoff should be ~30 days ago
    const expected = Date.now() - 30 * 24 * 60 * 60 * 1000;
    expect(where.createdAt.lt.getTime()).toBeGreaterThan(expected - 60_000);
    expect(where.createdAt.lt.getTime()).toBeLessThan(expected + 60_000);
  });

  it('uses default 90 days when WEBHOOK_LOG_RETENTION_DAYS unset', async () => {
    deleteMany.mockResolvedValueOnce({ count: 0 });
    const { POST } = await import('./route');
    await POST(makeReq('webhook-log-purge'));
    const where = (deleteMany.mock.calls[0]![0] as { where: { createdAt: { lt: Date } } }).where;
    const expected = Date.now() - 90 * 24 * 60 * 60 * 1000;
    expect(where.createdAt.lt.getTime()).toBeGreaterThan(expected - 60_000);
    expect(where.createdAt.lt.getTime()).toBeLessThan(expected + 60_000);
  });

  // La seconde table purgée par ce créneau. Sans ces assertions, retirer la
  // purge des connexions laisserait les trois tests ci-dessus verts, et les
  // lignes s'accumuleraient indéfiniment — une rétention qui n'est pas sous
  // test n'est pas une rétention, c'est une intention.
  it('purge aussi les connexions au-delà de leur rétention', async () => {
    deleteMany.mockResolvedValueOnce({ count: 0 });
    deleteManyConnexions.mockResolvedValueOnce({ count: 7 });
    vi.stubEnv('CONNEXION_RETENTION_DAYS', '14');
    const { POST } = await import('./route');
    const res = await POST(makeReq('webhook-log-purge'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, connexions: 7 });

    expect(deleteManyConnexions).toHaveBeenCalledTimes(1);
    const where = (deleteManyConnexions.mock.calls[0]![0] as { where: { createdAt: { lt: Date } } })
      .where;
    const attendu = Date.now() - 14 * 24 * 60 * 60 * 1000;
    expect(where.createdAt.lt.getTime()).toBeGreaterThan(attendu - 60_000);
    expect(where.createdAt.lt.getTime()).toBeLessThan(attendu + 60_000);
  });

  it('garde les deux rétentions indépendantes', async () => {
    // Le piège qu'une seule variable d'environnement partagée créerait :
    // allonger la conservation des journaux de webhooks allongerait aussi
    // celle des connexions, sans que personne l'ait demandé.
    deleteMany.mockResolvedValueOnce({ count: 0 });
    deleteManyConnexions.mockResolvedValueOnce({ count: 0 });
    vi.stubEnv('WEBHOOK_LOG_RETENTION_DAYS', '365');
    vi.stubEnv('CONNEXION_RETENTION_DAYS', '7');
    const { POST } = await import('./route');
    await POST(makeReq('webhook-log-purge'));

    const seuilLogs = (deleteMany.mock.calls[0]![0] as { where: { createdAt: { lt: Date } } }).where
      .createdAt.lt;
    const seuilConnexions = (
      deleteManyConnexions.mock.calls[0]![0] as { where: { createdAt: { lt: Date } } }
    ).where.createdAt.lt;
    // 365 jours en arrière est bien plus ancien que 7 jours en arrière.
    expect(seuilLogs.getTime()).toBeLessThan(seuilConnexions.getTime());
  });

  it('défaut à 90 jours pour les connexions quand la variable est absente', async () => {
    deleteMany.mockResolvedValueOnce({ count: 0 });
    deleteManyConnexions.mockResolvedValueOnce({ count: 0 });
    const { POST } = await import('./route');
    await POST(makeReq('webhook-log-purge'));
    const where = (deleteManyConnexions.mock.calls[0]![0] as { where: { createdAt: { lt: Date } } })
      .where;
    const attendu = Date.now() - 90 * 24 * 60 * 60 * 1000;
    expect(where.createdAt.lt.getTime()).toBeGreaterThan(attendu - 60_000);
    expect(where.createdAt.lt.getTime()).toBeLessThan(attendu + 60_000);
  });
});
