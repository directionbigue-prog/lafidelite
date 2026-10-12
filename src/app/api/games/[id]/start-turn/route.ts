// POST /api/games/:id/start-turn — flips PASS_DEVICE -> ANSWERING (stamping
// the speed-bonus timer) for the session the caller's couple owns (Lot 2,
// Task 11).
//
// Idempotent by design: a client remounting mid-turn (e.g. after a refresh)
// may call this again while already ANSWERING — that must succeed as a
// no-op read rather than re-stamping `currentQuestionShownAt`, which would
// corrupt the speed-bonus timer (see state-machine.ts's `startAnsweringTurn`
// doc comment). Any other phase (ROUND_REVEAL, ROUND_INTRO, COMPLETE) is
// rejected with 409 INVALID_PHASE.
//
// Also owns the round-2/3 PENDING -> IN_PROGRESS transition (Design
// Decision 2): a GameRound stays PENDING until its first question is
// actually shown, which happens here, not at POST /round/advance time.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { loadOwnedGameSession } from '@/lib/server/game/session-helpers';
import { startAnsweringTurn, type SessionPhaseState } from '@/lib/server/game/state-machine';
import { shapeQuestionForClient } from '@/lib/server/game/response-shaping';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const STARTABLE_PHASES: ReadonlySet<string> = new Set(['PASS_DEVICE', 'ANSWERING']);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', reqCtx.requestId);
      return csrfFail;
    }

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
    // couple comes back null here too, and is reported identically to a
    // truly-missing session — never leak existence via a 403 vs 404 split.
    const session = await loadOwnedGameSession(prisma, couple.id, id);
    if (!session) {
      return NextResponse.json(
        { error: 'NO_ACTIVE_GAME', message: 'No game session is currently in progress.' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (!STARTABLE_PHASES.has(session.phase)) {
      return NextResponse.json(
        { error: 'INVALID_PHASE', message: `Cannot start a turn from phase '${session.phase}'.` },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const state: SessionPhaseState = {
      currentRoundNumber: session.currentRoundNumber,
      currentQuestionNumber: session.currentQuestionNumber,
      phase: session.phase,
      activePlayerRole: session.activePlayerRole,
      currentQuestionShownAt: session.currentQuestionShownAt,
    };
    const now = new Date();
    const next = startAnsweringTurn(state, now);

    // Only PASS_DEVICE -> ANSWERING actually changes anything; a call that
    // arrives while already ANSWERING must not re-stamp
    // currentQuestionShownAt (idempotent remount).
    if (session.phase === 'PASS_DEVICE') {
      await prisma.gameSession.update({
        where: { id: session.id },
        data: { phase: next.phase, currentQuestionShownAt: next.currentQuestionShownAt },
      });
    }

    const round = await prisma.gameRound.findFirst({
      where: { gameSessionId: session.id, roundNumber: session.currentRoundNumber },
      select: { id: true, status: true, type: true },
    });
    if (!round) {
      throw new Error(
        `POST /api/games/${session.id}/start-turn: no GameRound found for round ${session.currentRoundNumber}`,
      );
    }

    // Design Decision 2: rounds 2-3 stay PENDING until their first question
    // is actually shown, which is this call.
    if (round.status === 'PENDING') {
      await prisma.gameRound.update({
        where: { id: round.id },
        data: { status: 'IN_PROGRESS', startedAt: now },
      });
    }

    const gameRoundQuestion = await prisma.gameRoundQuestion.findFirst({
      where: { gameRoundId: round.id, orderIndex: session.currentQuestionNumber - 1 },
      select: {
        question: { select: { id: true, roundType: true, prompt: true, options: true } },
      },
    });
    if (!gameRoundQuestion) {
      throw new Error(
        `POST /api/games/${session.id}/start-turn: no GameRoundQuestion found for round ` +
          `${session.currentRoundNumber} orderIndex ${session.currentQuestionNumber - 1}`,
      );
    }

    return NextResponse.json(
      {
        activePlayerRole: session.activePlayerRole,
        roundType: round.type,
        currentQuestionNumber: session.currentQuestionNumber,
        question: shapeQuestionForClient(gameRoundQuestion.question),
      },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
