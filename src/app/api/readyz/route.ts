/**
 * Readiness probe — "this instance is fit to serve traffic".
 * Pings DB and (if configured) Redis. Returns 503 if either is down so
 * the load balancer routes traffic away until they recover.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { diagnostiquerEnvironnement } from '@/lib/config/environnement';
import { alertesPaiement, etatPaiement } from '@/lib/server/payments/etat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROBE_TIMEOUT_MS = 1_500;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`probe timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};
  let allOk = true;

  {
    const t0 = Date.now();
    try {
      await withTimeout(prisma.$queryRawUnsafe('SELECT 1'), PROBE_TIMEOUT_MS);
      checks.database = { ok: true, latencyMs: Date.now() - t0 };
    } catch (err) {
      allOk = false;
      checks.database = {
        ok: false,
        latencyMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (redis) {
    const t0 = Date.now();
    try {
      await withTimeout(redis.ping(), PROBE_TIMEOUT_MS);
      checks.redis = { ok: true, latencyMs: Date.now() - t0 };
    } catch (err) {
      allOk = false;
      checks.redis = {
        ok: false,
        latencyMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Mail: reported, NOT gated. Deliberately separate from `checks`.
  //
  // On 2026-10-02 this endpoint answered `{"ok":true}` with database and redis
  // green while nobody could say whether a verification email could be sent at
  // all — the two things it probed were exactly the two that were fine. The
  // whole point of a readiness probe is to answer that question without a
  // deploy, so it now says.
  //
  // It must not flip `allOk`, and the reason is not cosmetic: this endpoint
  // drives load-balancer routing. An app with no Resend key still serves the
  // game, the Salon and every read path, so taking it out of rotation over a
  // missing email provider would turn a degraded feature into an outage.
  //
  // Presence only — never a value, never a prefix. `configured` mirrors
  // getEmailQueue()'s own condition by CALLING it rather than restating it, so
  // the two cannot drift; `missing` then names what to go and set.
  const emailQueue = getEmailQueue();
  const missing = (
    [
      ['UPSTASH_REDIS_REST_URL', process.env.UPSTASH_REDIS_REST_URL],
      ['UPSTASH_REDIS_REST_TOKEN', process.env.UPSTASH_REDIS_REST_TOKEN],
      ['RESEND_API_KEY', process.env.RESEND_API_KEY],
      ['EMAIL_FROM', process.env.EMAIL_FROM],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([name]) => name);

  // Configuration and payment: reported, NOT gated, for the same reason as
  // mail. On 2026-10-13 every pack purchase failed because PUBLIC_URL began
  // with an invisible BOM — and Vercel will not show a "Secret" variable's
  // value to anyone, so only the running server can see such a defect. It is
  // named here (variable NAME and defect kind — never a value, prefix or
  // length), together with the payment provider and its mode, so a glance at
  // this endpoint after any env change says whether payments can work.
  const suspectes = diagnostiquerEnvironnement(process.env);
  const paiement = etatPaiement(process.env, process.env.NODE_ENV === 'production');

  return NextResponse.json(
    {
      ok: allOk,
      time: new Date().toISOString(),
      checks,
      email: {
        configured: emailQueue !== null,
        missing,
        note: 'informational — a missing email provider does not fail this probe',
      },
      configuration: {
        ok: suspectes.length === 0,
        suspectes,
        note: 'informational — variables carrying a BOM, invisible characters, surrounding spaces or quotes',
      },
      paiement: { ...paiement, alertes: alertesPaiement(paiement) },
    },
    { status: allOk ? 200 : 503 },
  );
}
