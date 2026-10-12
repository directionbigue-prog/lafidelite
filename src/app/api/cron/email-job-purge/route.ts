// POST /api/cron/email-job-purge — daily retention purge for EmailJob.
//
// Why: every signup / forgot-password / payment-confirmation enqueues an
// EmailJob row (persistent audit trail of what was sent). Without retention,
// the table grows unbounded on Neon — multi-GB after a few months of usage.
//
// What we delete: rows with `status='SENT'` AND `sentAt < cutoff`. We keep
// `DEAD` rows so an operator can investigate / replay them, and `PENDING`
// rows (they shouldn't be stuck — but if they are, leave them for the queue
// drain to handle, not for the purger to drop).
//
// Mirrors the webhook-log-purge structure (D-11 + Pitfall 6 — env read at
// handler-call time so tests can vi.stubEnv it).
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
    const days = envInt(process.env.EMAIL_JOB_RETENTION_DAYS, 30);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let processed = 0;

    await withLease(redis ?? undefined, 'email-job-purge', LEASE_TTL_MS, async () => {
      const result = await prisma.emailJob.deleteMany({
        where: {
          status: 'SENT',
          sentAt: { lt: cutoff },
        },
      });
      processed = result.count;
      log.info('email-job-purge tick', { processed, days, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, processed },
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
