// AUTH-01 — POST /api/auth/signup
//
// Enumeration-resistant: returns identical 201 { ok: true } whether the email
// is new or already exists (D-22). Genuinely new users get a User row, an
// EMAIL_VERIFY VerificationCode, and an outbox email event — all in one tx.
// Existing-email branch runs `dummyBcryptCompare` so the request takes
// ~the same time as the new-user branch (timing parity).
//
// CSRF carve-out: signup is a pre-session route — no CSRF cookie exists yet,
// so calling verifyCsrf would 403 every legitimate request. The CSRF cookie is
// set on session establishment (verify-email / login / refresh).
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { hashPassword, generateVerificationCode } from '@/lib/server/auth';
import { isBanned } from '@/lib/server/auth/banned-passwords';
import { isPwned } from '@/lib/server/auth/hibp';
import { dummyBcryptCompare } from '@/lib/server/auth/dummy-bcrypt';
import { enqueueOutbox } from '@/lib/server/outbox';
import { scheduleDrain } from '@/lib/server/outbox/drain-now';
import { envInt } from '@/lib/server/env';

const PASSWORD_MIN = envInt(process.env.AUTH_PASSWORD_MIN_LENGTH, 10);
const VERIFICATION_TTL_MS = envInt(process.env.AUTH_VERIFICATION_TTL_MIN, 15) * 60 * 1000;

const Body = z.object({
  email: zEmail,
  password: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  inviteCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'auth:signup',
  windowMs: 60 * 60 * 1000, // 1 hour (D-08)
  max: envInt(process.env.AUTH_SIGNUP_RATE_LIMIT_MAX, 5),
  code: 'TOO_MANY_SIGNUP_ATTEMPTS',
  message: 'Too many signup attempts. Try again later.',
});

function formatIssues(err: z.ZodError) {
  return err.issues.map((e) => ({ path: e.path.join('.'), message: e.message }));
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    // 1. Body parse + Zod validation.
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      const res = NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: formatIssues(parsed.error) },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    const { email, password, name, inviteCode } = parsed.data;

    // 2. Password policy gates BEFORE looking up user (D-22 — keep the no-user
    //    and existing-user branches symmetric below).
    //    Banned check runs before length so a common short password ("password")
    //    surfaces the more specific PASSWORD_BANNED code rather than TOO_SHORT.
    if (isBanned(password)) {
      const res = NextResponse.json(
        { error: 'PASSWORD_BANNED', message: 'This password is too common.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (password.length < PASSWORD_MIN) {
      const res = NextResponse.json(
        {
          error: 'PASSWORD_TOO_SHORT',
          message: `Password must be at least ${PASSWORD_MIN} characters`,
        },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (process.env.PASSWORD_HIBP_CHECK === '1' && (await isPwned(password))) {
      const res = NextResponse.json(
        {
          error: 'PASSWORD_PWNED',
          message: 'This password appeared in a known data breach.',
        },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    // 3. Per-email rate limit.
    const rateFail = await limiter.check(req, email);
    if (rateFail) return rateFail;

    // 4. Existing-email branch — return identical 201 with timing parity (D-22).
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      await dummyBcryptCompare(password);
      log.info('signup duplicate (enumeration-resist)');
      const res = NextResponse.json({ ok: true }, { status: 201 });
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    // 5. New-user branch — hash + create User + VerificationCode + outbox.
    const passwordHash = await hashPassword(password);
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

    await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: { email, passwordHash, name },
          select: { id: true },
        });
        await tx.verificationCode.create({
          data: {
            userId: user.id,
            code,
            type: 'EMAIL_VERIFY',
            expiresAt,
          },
        });
        await enqueueOutbox(tx, {
          kind: 'email.verification_code',
          payload: {
            to: email,
            code,
            expiresAt: expiresAt.toISOString(),
          },
        });

        // Auto-join an invite, if one was supplied and is still valid. Never
        // fails the signup over a bad/expired code (D-22-adjacent: a signup
        // that 500s or 400s here would leak invite-validity information and
        // block a legitimate account creation over an unrelated concern).
        //
        // Race guard: same reasoning as POST /api/couples/join — re-assert
        // PENDING + no-partner atomically in the write itself via
        // `updateMany`. A concurrent join racing on the same code can only
        // win once; here the loser just silently skips the join (per this
        // route's own invariant of never failing signup over invite
        // issues) rather than returning a 409.
        if (inviteCode) {
          const couple = await tx.couple.findFirst({
            where: { inviteCode, status: 'PENDING' },
            select: { id: true, inviteExpiresAt: true },
          });
          if (couple && couple.inviteExpiresAt.getTime() > Date.now()) {
            await tx.couple.updateMany({
              where: { id: couple.id, status: 'PENDING', partnerId: null },
              data: { partnerId: user.id, status: 'ACTIVE', pairedAt: new Date() },
            });
          }
        }
      },
      // This transaction does up to 5 sequential round trips (user create,
      // verificationCode create, outbox insert, and — when an inviteCode is
      // present — a couple lookup + update). Prisma's default interactive
      // transaction timeout (5000ms) can be too tight against a remote
      // serverless Postgres (Neon) under cold-start or network latency,
      // surfacing as a spurious P2028 "Transaction not found" that fails
      // the entire signup rather than just the invite-join step. Widen the
      // timeout so the transaction has realistic headroom.
      { timeout: 15000, maxWait: 10000 },
    );

    log.info('signup new user');
    // Hobby crons are daily (see lib/server/outbox/drain-now.ts). Flush the
    // mail path once the response is out, so the code reaches the user in
    // seconds rather than whenever tomorrow's cron happens to fire.
    scheduleDrain(ctx.requestId);

    const res = NextResponse.json({ ok: true }, { status: 201 });
    res.headers.set('x-request-id', ctx.requestId);
    return res;
  });
}
