// POST /api/couples/disclaimer/accept — records this user's acceptance of
// the fidelity-game relational-guardrail disclaimer (PRD §11, P0). Both
// disclaimerAcceptedBy{Creator,Partner}At must be non-null before
// POST /api/games (Lot 2) will create a session — see Couple's Prisma
// doc comment. Idempotent: accepting again just re-stamps the timestamp.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

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

    const couple = await prisma.couple.findFirst({
      where: {
        status: { in: ['PENDING', 'ACTIVE'] },
        OR: [{ creatorId: userId }, { partnerId: userId }],
      },
      select: { id: true, creatorId: true, partnerId: true },
    });
    if (!couple) {
      return NextResponse.json(
        { error: 'NO_ACTIVE_COUPLE', message: 'You do not belong to an Espace Couple.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const isCreator = couple.creatorId === userId;
    const updated = await prisma.couple.update({
      where: { id: couple.id },
      data: isCreator
        ? { disclaimerAcceptedByCreatorAt: new Date() }
        : { disclaimerAcceptedByPartnerAt: new Date() },
      select: { disclaimerAcceptedByCreatorAt: true, disclaimerAcceptedByPartnerAt: true },
    });

    return NextResponse.json(
      {
        acceptedByCreator: updated.disclaimerAcceptedByCreatorAt !== null,
        acceptedByPartner: updated.disclaimerAcceptedByPartnerAt !== null,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
