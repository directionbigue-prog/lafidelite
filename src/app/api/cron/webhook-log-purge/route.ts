export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30; // D-10

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { envInt } from '@/lib/server/env';

const log = createLogger();
const LEASE_TTL_MS = 60_000; // ~2 × maxDuration (Pitfall 3)

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    // Pitfall 6: read env at handler-call time so vi.stubEnv works in tests.
    const days = envInt(process.env.WEBHOOK_LOG_RETENTION_DAYS, 90); // D-11 default
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // La rétention des connexions est séparée et plus courte : 90 jours de
    // journaux de webhooks servent une enquête de facturation, là où un
    // historique de connexions au-delà d'un trimestre ne répond à aucune
    // question que la console pose. Les deux sont réglables indépendamment.
    const joursConnexions = envInt(process.env.CONNEXION_RETENTION_DAYS, 90);
    const seuilConnexions = new Date(Date.now() - joursConnexions * 24 * 60 * 60 * 1000);

    let processed = 0;
    let connexions = 0;

    await withLease(redis ?? undefined, 'webhook-log-purge', LEASE_TTL_MS, async () => {
      // D-15 + A2: inline deleteMany; the WHERE column is `createdAt`
      // (schema-verified — see prisma/schema.prisma WebhookLog model).
      const result = await prisma.webhookLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      processed = result.count;

      // Greffé ici plutôt que sur un septième cron : le quota de tâches
      // planifiées d'un compte Hobby n'est pas documenté de façon fiable, et
      // un déploiement refusé pour une purge coûterait plus que le léger
      // abus de nom de cette route. C'est le créneau quotidien « on efface
      // les lignes trop vieilles », et une purge de rétention y est chez elle.
      const r2 = await prisma.connexionEvent.deleteMany({
        where: { createdAt: { lt: seuilConnexions } },
      });
      connexions = r2.count;

      log.info('webhook-log-purge tick', {
        processed,
        days,
        connexions,
        joursConnexions,
        requestId: ctx.requestId,
      });
    });

    return NextResponse.json(
      { ok: true, processed, connexions },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

// Vercel Cron invokes cron paths with GET, never POST — so GET must exist, or
// the schedule answers a bare 405 and the job never runs. Nothing reports that:
// a cron that is never invoked produces no logs and no errors. Measured against
// the live deployment on 2026-10-02 — all six paths answered 405.
//
// POST stays exported: the drain scripts and the route tests call it, and it is
// the honest verb for a handler that mutates. Both verbs go through
// verifyCronSecret, so neither is open. See cron-get-alias.test.ts.
export const GET = POST;
