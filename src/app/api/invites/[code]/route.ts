// GET /api/invites/[code] — PUBLIC, no auth. Lets the /invite/[code] and
// /inscription pages show "X t'invite" (or "this link expired") before the
// visitor has an account. Never leaks anything beyond the creator's first
// name — no email, no user id, no couple id.
//
// Being public and unauthenticated, this route has no per-userId brute-force
// guard the way POST /api/couples/join does (10/min per authenticated user)
// — an anonymous attacker could otherwise enumerate the entire 1,000,000-
// value 6-digit code space against this endpoint to harvest valid codes.
// IP-keyed rate limit closes that: reuses `createEmailLimiter` with a null
// email, which makes it bucket purely on the caller's IP (its documented
// fallback behavior — see rate-limit-by-email.ts's `bucketKey`).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { INVITE_CODE_REGEX } from '@/lib/server/couples/invite-code';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { redis } from '@/lib/server/redis';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'invites:preview',
  windowMs: 60 * 1000,
  max: 20,
  code: 'TOO_MANY_INVITE_LOOKUPS',
  message: 'Too many requests. Try again in a minute.',
});

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const rl = await limiter.check(req, null);
    if (rl) {
      rl.headers.set('x-request-id', reqCtx.requestId);
      return rl;
    }

    const { code } = await ctx.params;
    if (!INVITE_CODE_REGEX.test(code)) {
      return NextResponse.json(
        { valid: false, expired: false },
        { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const couple = await prisma.couple.findFirst({
      where: { inviteCode: code, status: 'PENDING' },
      select: { inviteExpiresAt: true, creator: { select: { name: true } } },
    });

    if (!couple) {
      return NextResponse.json(
        { valid: false, expired: false },
        { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (couple.inviteExpiresAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { valid: false, expired: true },
        { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    return NextResponse.json(
      { valid: true, creatorName: couple.creator.name },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
