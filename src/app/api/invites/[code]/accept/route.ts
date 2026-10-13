// POST /api/invites/[code]/accept — PUBLIC. The invited partner joins the
// Espace Couple and is signed in, in one step, with nothing but a first name.
//
// Only the partner who sends the invitation goes through signup + email
// verification. The 6-digit code they shared IS the invitee's credential:
// it is single-use (PENDING → ACTIVE flips once), expires after 7 days, and
// already lets anyone holding it pair with an existing account through
// POST /api/couples/join. This route spares the invitee the account-creation
// detour that stood between the link and the first game.
//
// The account gets a placeholder address in a reserved `.invalid` domain
// (lib/couples/compte-invite.ts) because `User.email` is required; the email
// queue refuses to mail it. No password is set, so the session cookies issued
// here are the only way in — they slide on every refresh (7 days).
//
// CSRF: pre-session route, like signup — no CSRF cookie exists yet. Instead a
// cross-site Origin is refused, so another site cannot silently sign a
// visitor into a guest account it controls (login CSRF).
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { INVITE_CODE_REGEX } from '@/lib/server/couples/invite-code';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { redis } from '@/lib/server/redis';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import {
  createAccessToken,
  createRefreshToken,
  setAuthCookies,
  setCsrfCookie,
} from '@/lib/server/auth';
import { adresseInvite } from '@/lib/couples/compte-invite';

const Body = z.object({ name: z.string().trim().min(1).max(100) });

// IP-keyed (null email ⇒ IP bucket): an anonymous caller must not be able
// to walk the 1,000,000-value code space here any faster than on the preview.
const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'invites:accept',
  windowMs: 60 * 1000,
  max: 10,
  code: 'TOO_MANY_JOIN_ATTEMPTS',
  message: 'Too many join attempts. Try again in a minute.',
});

type Refus = 'INVITE_NOT_FOUND' | 'INVITE_EXPIRED' | 'INVITE_ALREADY_USED';

const STATUT: Record<Refus, number> = {
  INVITE_NOT_FOUND: 404,
  INVITE_EXPIRED: 410,
  INVITE_ALREADY_USED: 409,
};

class InviteRefusee extends Error {
  constructor(readonly code: Refus) {
    super(code);
  }
}

function origineEtrangere(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== (req.headers.get('host') ?? req.nextUrl.host);
  } catch {
    return true;
  }
}

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };

    if (origineEtrangere(req)) {
      return NextResponse.json(
        { error: 'CSRF_ORIGIN_MISMATCH', message: 'Cross-site request refused.' },
        { status: 403, headers },
      );
    }

    const rl = await limiter.check(req, null);
    if (rl) {
      rl.headers.set('x-request-id', ctx.requestId);
      return rl;
    }

    const { code } = await routeCtx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!INVITE_CODE_REGEX.test(code) || !parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request' },
        { status: 400, headers },
      );
    }
    const { name } = parsed.data;

    let user: { id: string; email: string; tokenVersion: number };
    let partnerName: string | null;
    try {
      ({ user, partnerName } = await prisma.$transaction(
        async (tx) => {
          const couple = await tx.couple.findFirst({
            where: { inviteCode: code },
            select: {
              id: true,
              status: true,
              partnerId: true,
              inviteExpiresAt: true,
              creator: { select: { name: true } },
            },
          });
          if (!couple) throw new InviteRefusee('INVITE_NOT_FOUND');
          if (couple.status !== 'PENDING' || couple.partnerId) {
            throw new InviteRefusee('INVITE_ALREADY_USED');
          }
          if (couple.inviteExpiresAt.getTime() <= Date.now()) {
            throw new InviteRefusee('INVITE_EXPIRED');
          }

          const created = await tx.user.create({
            data: { email: adresseInvite(globalThis.crypto.randomUUID()), name },
            select: { id: true, email: true, tokenVersion: true },
          });

          // Same race guard as POST /api/couples/join: the flip re-asserts
          // PENDING + no partner in the write itself. The loser throws, which
          // rolls back its freshly created account with it.
          const { count } = await tx.couple.updateMany({
            where: { id: couple.id, status: 'PENDING', partnerId: null },
            data: { partnerId: created.id, status: 'ACTIVE', pairedAt: new Date() },
          });
          if (count === 0) throw new InviteRefusee('INVITE_ALREADY_USED');

          return { user: created, partnerName: couple.creator.name };
        },
        { timeout: 15000, maxWait: 10000 },
      ));
    } catch (err) {
      if (err instanceof InviteRefusee) {
        return NextResponse.json(
          { error: err.code, message: 'This invite cannot be used.' },
          { status: STATUT[err.code], headers },
        );
      }
      throw err;
    }

    const access = await createAccessToken({
      sub: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });
    const refresh = await createRefreshToken(user.id, user.tokenVersion);
    await setAuthCookies(access, refresh);
    await setCsrfCookie();

    log.info('invite accepted as guest', { userId: user.id });
    return NextResponse.json(
      { ok: true, user: { sub: user.id }, partnerName },
      { status: 200, headers },
    );
  });
}
