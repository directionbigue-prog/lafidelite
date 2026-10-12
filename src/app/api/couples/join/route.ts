// POST /api/couples/join — join an existing Espace Couple by 6-digit code.
//
// For an already-authenticated user (e.g. they already had an account and
// logged in before using the invite — see design spec §"Invité sans
// compte"). The brand-new-account path is handled inline by
// POST /api/auth/signup instead (Task 3) so it can join atomically with
// account creation.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { findActiveCoupleForUser } from '@/lib/server/couples/queries';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { redis } from '@/lib/server/redis';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ code: z.string().regex(/^\d{6}$/) });

// Reused generically, keyed on userId (the "email" param is just a bucket
// key) — closes the "try many codes while logged in" brute-force path
// against the 1M-value code space.
const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'couples:join',
  windowMs: 60 * 1000,
  max: 10,
  code: 'TOO_MANY_JOIN_ATTEMPTS',
  message: 'Too many join attempts. Try again in a minute.',
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', ctx.requestId);
      return csrfFail;
    }

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }
    const userId = auth.user.sub;

    const rl = await limiter.check(req, userId);
    if (rl) {
      rl.headers.set('x-request-id', ctx.requestId);
      return rl;
    }

    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { code } = parsed.data;

    const already = await findActiveCoupleForUser(prisma, userId);
    if (already) {
      return NextResponse.json(
        { error: 'ALREADY_IN_COUPLE', message: 'You already belong to an Espace Couple.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const couple = await prisma.couple.findFirst({
      where: { inviteCode: code },
      select: {
        id: true,
        creatorId: true,
        status: true,
        inviteExpiresAt: true,
        creator: { select: { name: true } },
      },
    });
    if (!couple) {
      return NextResponse.json(
        { error: 'INVITE_NOT_FOUND', message: 'This invite code does not exist.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (couple.creatorId === userId) {
      return NextResponse.json(
        { error: 'CANNOT_JOIN_OWN_COUPLE', message: 'You cannot join your own invite.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (couple.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'INVITE_ALREADY_USED', message: 'This invite has already been used.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (couple.inviteExpiresAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'INVITE_EXPIRED', message: 'This invite has expired.' },
        { status: 410, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Race guard: re-assert the preconditions (still PENDING, no partner
    // yet) atomically as part of the write itself. Two requests racing on
    // the same invite code can both pass the reads above; Postgres
    // serializes concurrent `updateMany` calls on the same row, so only
    // one of them can flip PENDING -> ACTIVE. The loser sees count === 0
    // and reports the invite as already used instead of silently
    // overwriting the winner's partnerId.
    const pairedAt = new Date();
    const { count } = await prisma.couple.updateMany({
      where: { id: couple.id, status: 'PENDING', partnerId: null },
      data: { partnerId: userId, status: 'ACTIVE', pairedAt },
    });
    if (count === 0) {
      return NextResponse.json(
        { error: 'INVITE_ALREADY_USED', message: 'This invite has already been used.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      {
        id: couple.id,
        status: 'ACTIVE' as const,
        partnerName: couple.creator.name,
        pairedAt: pairedAt.toISOString(),
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
