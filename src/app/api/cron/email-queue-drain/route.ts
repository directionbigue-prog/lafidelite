export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // D-10

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { redis } from '@/lib/server/redis';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const BATCH_SIZE = 100; // D-08
const LEASE_TTL_MS = 120_000; // ~2 × maxDuration (Pitfall 3)

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let processed = 0;
    let sent = 0;
    let skipped = 0;

    await withLease(redis ?? undefined, 'email-queue-drain', LEASE_TTL_MS, async () => {
      const queue = getEmailQueue();
      if (!queue) {
        // No mailer/redis configured — graceful no-op. Operators see this in
        // logs and can wire UPSTASH_REDIS_REST_URL + RESEND_API_KEY.
        log.warn(
          'email-queue-drain: not configured (UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN/RESEND_API_KEY missing)',
          {
            requestId: ctx.requestId,
          },
        );
        return;
      }

      for (let i = 0; i < BATCH_SIZE; i++) {
        const outcome = await queue.drainOne();
        if (outcome === 'empty') break;
        processed++;
        if (outcome === 'sent') sent++;
        else if (outcome === 'skipped') skipped++;
      }

      // `processed` counts everything the queue handed back, stale pointers
      // included, so it cannot answer "did any mail leave?". `sent` and
      // `skipped` can — a tick that is all skips means the queue holds
      // pointers to rows that no longer exist, which is worth seeing.
      log.info('email-queue-drain tick', { processed, sent, skipped, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, processed, sent, skipped },
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
