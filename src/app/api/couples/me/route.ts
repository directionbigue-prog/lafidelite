// GET /api/couples/me — current user's Espace Couple status.
//
// Polled every 3s by the /couple/attente waiting screen (no WebSocket for
// this lot — see design spec "hors périmètre"). Shape depends on status:
//   no couple → { couple: null }
//   PENDING   → the invite (code + link), so the waiting screen can render
//               without a second round-trip
//   ACTIVE    → the OTHER person's name (creator sees partner's, and
//               vice versa), so the confirmation screen can greet both.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { findComplicityLevel } from '@/lib/server/game/scoring';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { origineDepuis } from '@/lib/server/app-url';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
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
      select: {
        id: true,
        status: true,
        creatorId: true,
        partnerId: true,
        inviteCode: true,
        inviteExpiresAt: true,
        pairedAt: true,
        disclaimerAcceptedByCreatorAt: true,
        disclaimerAcceptedByPartnerAt: true,
        cumulativeCoupleScore: true,
        creator: { select: { name: true } },
        partner: { select: { name: true } },
        // "7 parties jouées ensemble" on the dashboard (planche 01).
        //
        // Counted HERE, in the same query, rather than in a second
        // `gameSession.count` afterwards. The count needs `couple.id`, so
        // as a separate call it could only ever run after this one
        // returned — a second sequential round-trip to a Postgres that
        // sits ~1s away, on the app's most-visited screen. A filtered
        // relation count costs one JOIN instead.
        //
        // COMPLETED only. An abandoned or still-running session is not a
        // game the couple played together, and counting it would inflate
        // the one number on that screen they could plausibly check
        // against their own memory — which is exactly the number that
        // must not be wrong.
        //
        // Still strictly an aggregate: how often you have played, never
        // what either of you answered.
        _count: { select: { gameSessions: { where: { status: 'COMPLETED' } } } },
      },
    });

    if (!couple) {
      return NextResponse.json(
        { couple: null },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (couple.status === 'PENDING') {
      const appUrl = origineDepuis(req.headers);
      return NextResponse.json(
        {
          couple: {
            status: 'PENDING' as const,
            code: couple.inviteCode,
            inviteUrl: `${appUrl}/invite/${couple.inviteCode}`,
            expiresAt: couple.inviteExpiresAt.toISOString(),
          },
        },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // ACTIVE — show the OTHER person's name. Also surfaces the disclaimer
    // acceptance flags (as booleans, never the raw timestamps) so /jeu can
    // gate on load rather than discovering DISCLAIMER_REQUIRED lazily from
    // POST /api/games — see couples-error-messages.ts's DISCLAIMER_REQUIRED
    // entry and src/lib/game/start-screen.ts's needsDisclaimerGate.
    const isCreator = couple.creatorId === userId;
    const partnerName = isCreator ? (couple.partner?.name ?? null) : couple.creator.name;

    const gamesPlayed = couple._count.gameSessions;

    return NextResponse.json(
      {
        couple: {
          status: 'ACTIVE' as const,
          partnerName,
          // Which side of the couple the CALLER is. The pass-and-play
          // screens compare this against the session's `activePlayerRole`
          // to decide between "à toi de jouer" and "passe le téléphone à
          // <partnerName>" — without it the client knows the active ROLE
          // but has no way to map that role to a person.
          viewerRole: isCreator ? ('CREATOR' as const) : ('PARTNER' as const),
          pairedAt: couple.pairedAt?.toISOString() ?? null,
          disclaimerAcceptedByCreator: couple.disclaimerAcceptedByCreatorAt !== null,
          disclaimerAcceptedByPartner: couple.disclaimerAcceptedByPartnerAt !== null,
          // The couple's standing across all their games, for /jeu's start
          // screen. Deliberately the AGGREGATE only: the guardrail this
          // product keeps is that no past answer is ever consultable, and a
          // running total says how you are doing together without
          // reopening anything either of you said.
          //
          // The level is computed here, from the scoring engine's own
          // threshold table, so the screen never carries a second copy of
          // it.
          cumulativeCoupleScore: couple.cumulativeCoupleScore,
          complicityLevel: findComplicityLevel(couple.cumulativeCoupleScore),
          gamesPlayed,
        },
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
