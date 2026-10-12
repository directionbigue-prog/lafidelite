// GET /api/games/:id/results — the final GameResult for a COMPLETED game
// session, for the end-of-game summary screen (Lot 2, Task 15).
//
// Read-only: `requireAuth` only, no `verifyCsrf` — CSRF protects mutations,
// this is a GET.
//
// Design Decision 5 (never leak existence): a session that doesn't exist,
// belongs to another couple, or simply hasn't finished all 3 rounds yet all
// collapse into the SAME 404. Splitting "not found" from "not completed"
// would let a peeking caller learn a game is still in progress before its
// own owner has seen the reveal — so both branches are checked together and
// report the identical error.
//
// `creatorTitle`/`partnerTitle` have no columns on GameResult by design
// (see round/advance/route.ts's comment on the same point) — they are pure
// derivations of the PERSISTED `winnerRole` column, re-derived here via
// `scoring.ts`'s exported `deriveTitles`. Titles are deliberately derived
// from `winnerRole`, never re-computed from the two raw scores: the
// creator-vs-partner comparison that decides a winner happens in exactly
// ONE place (`computeGameResult`, at write time) — re-running it here would
// let the titles and the persisted `winnerRole` disagree if that comparison
// ever changes (see `deriveTitles`'s doc comment in scoring.ts).
//
// `gapMasked` hides the numeric gap entirely, not merely rounds it: when
// true, `creatorTotalScore` / `partnerTotalScore` / `gapPercent` are
// OMITTED from the response body (not null, not zero) so a client can never
// recover them, and a fixed French `maskedMessage` is sent instead.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { loadOwnedGameSession } from '@/lib/server/game/session-helpers';
import { deriveTitles } from '@/lib/server/game/scoring';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const GAP_MASKED_MESSAGE = 'Match serré sur les valeurs, écart sur la connaissance.';

interface ResultsResponseBase {
  coupleScore: number;
  complicityLevel: string;
  creatorTitle: string;
  partnerTitle: string;
  winnerRole: string;
  conversationPrompts: unknown;
}

interface ResultsResponseUnmasked extends ResultsResponseBase {
  creatorTotalScore: number;
  partnerTotalScore: number;
  gapPercent: number;
}

interface ResultsResponseMasked extends ResultsResponseBase {
  maskedMessage: string;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', reqCtx.requestId);
      return auth;
    }
    const userId = auth.user.sub;

    const couple = await findActivatedCoupleForUser(prisma, userId);
    if (!couple) {
      return NextResponse.json(
        { error: 'NO_ACTIVE_COUPLE', message: 'You do not belong to an active Espace Couple.' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { id } = await ctx.params;

    // Design Decision 5: a session that exists but belongs to a different
    // couple comes back null here too, and (per the class doc comment
    // above) a session that hasn't finished all 3 rounds yet is reported
    // identically — never leak existence or in-progress state via a
    // distinguishing 404.
    const session = await loadOwnedGameSession(prisma, couple.id, id);
    if (!session || session.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'RESULTS_NOT_AVAILABLE', message: 'No results are available for this game.' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const gameResult = await prisma.gameResult.findUnique({
      where: { gameSessionId: session.id },
    });
    if (!gameResult) {
      // A COMPLETED GameSession without a banked GameResult is a
      // data-integrity violation (round/advance/route.ts always creates the
      // GameResult in the SAME transaction that flips status to COMPLETED)
      // — a 500 is correct here, not a silent 404.
      throw new Error(
        `GET /api/games/${session.id}/results: session is COMPLETED but has no GameResult`,
      );
    }

    // winnerRole is `String?` in the schema for migration-safety reasons
    // only — round/advance/route.ts always sets it (to one of
    // CREATOR/PARTNER/TIE) when creating a GameResult, so a null or
    // out-of-domain value here is a data-integrity violation, not a
    // legitimate state to serve to a client. Validating it here also lets
    // `deriveTitles` below take a narrowed `'CREATOR' | 'PARTNER' | 'TIE'`
    // instead of a bare `string`.
    if (
      gameResult.winnerRole !== 'CREATOR' &&
      gameResult.winnerRole !== 'PARTNER' &&
      gameResult.winnerRole !== 'TIE'
    ) {
      throw new Error(
        `GET /api/games/${session.id}/results: GameResult ${gameResult.id} has an invalid winnerRole '${String(gameResult.winnerRole)}'`,
      );
    }
    const winnerRole = gameResult.winnerRole;

    const { creatorTitle, partnerTitle } = deriveTitles(winnerRole);

    const base: ResultsResponseBase = {
      coupleScore: gameResult.coupleScore,
      complicityLevel: gameResult.complicityLevel,
      creatorTitle,
      partnerTitle,
      winnerRole,
      conversationPrompts: gameResult.conversationPrompts,
    };

    const body: ResultsResponseUnmasked | ResultsResponseMasked = gameResult.gapMasked
      ? { ...base, maskedMessage: GAP_MASKED_MESSAGE }
      : {
          ...base,
          creatorTotalScore: gameResult.creatorTotalScore,
          partnerTotalScore: gameResult.partnerTotalScore,
          gapPercent: gameResult.gapPercent,
        };

    return NextResponse.json(body, { status: 200, headers: { 'x-request-id': reqCtx.requestId } });
  });
}
