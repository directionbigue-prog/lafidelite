// POST /api/couples — create an "Espace Couple" (PRD §9 R1).
//
// The authenticated caller becomes the couple's creator, in PENDING status,
// with a fresh 6-digit invite code valid 7 days. A user may only have one
// PENDING/ACTIVE couple at a time (findActiveCoupleForUser).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { findActiveCoupleForUser } from '@/lib/server/couples/queries';
import { generateInviteCode, INVITE_TTL_MS } from '@/lib/server/couples/invite-code';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { origineDepuis } from '@/lib/server/app-url';

// Bounded retry for invite-code collisions. `generateInviteCode()` draws
// uniformly from a 1,000,000-value space with no reservation step, so as
// the Couple table grows a `create` can race into an already-taken code
// (unique constraint on `inviteCode`, Prisma error P2002) — codes are
// never freed, DISSOLVED couples keep theirs. A handful of attempts keeps
// the collision probability negligible without an unbounded retry loop.
const MAX_INVITE_CODE_ATTEMPTS = 5;

function isUniqueConstraintError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

// Two distinct unique constraints can fire P2002 on this create: the
// `inviteCode` column unique index (a collision in the code space — see
// MAX_INVITE_CODE_ATTEMPTS above), or the `Couple_creator_active_unique`
// partial unique index (this user raced another request into creating a
// second PENDING/ACTIVE couple — see Task 3c / the schema doc comment on
// the Couple model). Prisma resolves the violated index's columns into
// `meta.target` even for a raw-SQL partial index, so branch on that.
// Postgres may report a raw-SQL partial index's violation via the column
// name (`creatorId`) or the index name itself (`Couple_creator_active_unique`,
// see prisma/migrations/20260903093300_couple_creator_active_unique) — match
// both, since which one Prisma surfaces isn't guaranteed for indexes it
// didn't create from the schema DSL.
function isCreatorActiveConflict(err: Prisma.PrismaClientKnownRequestError): boolean {
  const target = err.meta?.target;
  const targets = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
  return targets.some((t) => t.includes('creatorId') || t.includes('Couple_creator_active_unique'));
}

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

    const existing = await findActiveCoupleForUser(prisma, auth.user.sub);
    if (existing) {
      return NextResponse.json(
        { error: 'ALREADY_IN_COUPLE', message: 'You already belong to an Espace Couple.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    let couple: { id: string; inviteCode: string; inviteExpiresAt: Date } | null = null;
    for (let attempt = 1; attempt <= MAX_INVITE_CODE_ATTEMPTS; attempt++) {
      try {
        couple = await prisma.couple.create({
          data: {
            creatorId: auth.user.sub,
            status: 'PENDING',
            inviteCode: generateInviteCode(),
            inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
          },
          select: { id: true, inviteCode: true, inviteExpiresAt: true },
        });
        break;
      } catch (err) {
        if (isUniqueConstraintError(err) && isCreatorActiveConflict(err)) {
          // The DB-enforced partial unique index caught a race that
          // findActiveCoupleForUser's earlier read missed (another request
          // for the same user created its PENDING/ACTIVE couple in between).
          // Regenerating the invite code would not help here — report the
          // same conflict the applicative check reports.
          return NextResponse.json(
            { error: 'ALREADY_IN_COUPLE', message: 'You already belong to an Espace Couple.' },
            { status: 409, headers: { 'x-request-id': ctx.requestId } },
          );
        }
        if (isUniqueConstraintError(err) && attempt < MAX_INVITE_CODE_ATTEMPTS) {
          log.warn(`invite code collision on attempt ${attempt}, retrying`);
          continue;
        }
        if (isUniqueConstraintError(err)) {
          log.error('invite code generation exhausted retries');
          return NextResponse.json(
            {
              error: 'INVITE_CODE_GENERATION_FAILED',
              message: 'Could not generate a unique invite code. Please try again.',
            },
            { status: 503, headers: { 'x-request-id': ctx.requestId } },
          );
        }
        throw err;
      }
    }
    // Unreachable in practice (the loop either returns a couple or an early
    // response), but keeps TypeScript's control-flow analysis happy.
    if (!couple) {
      return NextResponse.json(
        {
          error: 'INVITE_CODE_GENERATION_FAILED',
          message: 'Could not generate a unique invite code. Please try again.',
        },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const appUrl = origineDepuis(req.headers);
    return NextResponse.json(
      {
        id: couple.id,
        code: couple.inviteCode,
        inviteUrl: `${appUrl}/invite/${couple.inviteCode}`,
        expiresAt: couple.inviteExpiresAt.toISOString(),
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
