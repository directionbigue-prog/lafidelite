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

const log = createLogger();
const LEASE_TTL_MS = 60_000; // ~2 × maxDuration (Pitfall 3)

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let processed = 0;

    await withLease(redis ?? undefined, 'verification-cleanup', LEASE_TTL_MS, async () => {
      // D-13: inline deleteMany — single-query work doesn't deserve its own
      // lib helper. If complexity grows (e.g., per-purpose retention), refactor
      // to lib/server/auth/verification-cleanup.ts at that point.
      const result = await prisma.verificationCode.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      processed = result.count;
      log.info('verification-cleanup tick', { processed, requestId: ctx.requestId });
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
