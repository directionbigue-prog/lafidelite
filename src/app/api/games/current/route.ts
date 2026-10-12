// GET /api/games/current — the couple's IN_PROGRESS GameSession, resolved
// for display (Lot 2, Task 11).
//
// Read-only route: it never advances a turn (that's POST
// /api/games/:id/start-turn), but it DOES lazily resolve
// ROUND_INTRO -> PASS_DEVICE on read (state-machine.ts's
// `resolvePhaseOnRead`) and persists that resolution so a second read (or
// another device polling the same session) sees the settled phase instead
// of re-resolving it every time.
//
// The current question is only ever included in the response while
// `phase === 'ANSWERING'` — every other phase (PASS_DEVICE, ROUND_REVEAL,
// COMPLETE) must never leak the Question payload early, per this lot's
// Global Constraints.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { resolvePhaseOnRead, type SessionPhaseState } from '@/lib/server/game/state-machine';
import { shapeQuestionForClient, type ClientQuestion } from '@/lib/server/game/response-shaping';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CURRENT_SESSION_SELECT = {
  id: true,
  status: true,
  currentRoundNumber: true,
  currentQuestionNumber: true,
  phase: true,
  activePlayerRole: true,
  currentQuestionShownAt: true,
  jokersRemainingCreator: true,
  jokersRemainingPartner: true,
} as const;

interface CurrentGameSessionResponse {
  id: string;
  status: string;
  currentRoundNumber: number;
  currentQuestionNumber: number;
  phase: string;
  activePlayerRole: string;
  jokersRemainingCreator: number;
  jokersRemainingPartner: number;
  /**
   * How many questions each round of THIS session holds, in round order.
   *
   * Counted from the rows the game was built with rather than derived from
   * a constant: the three formats give rounds of 2, 5 or 10 questions, and
   * Express (2/2/1) does not even divide evenly. Every in-game screen draws
   * its progress bar from this - see `lib/game/progress.ts`, which used to
   * multiply a hardcoded 5 and silently drew a wrong bar for two formats
   * out of three.
   */
  questionsPerRound: number[];
  question?: ClientQuestion;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }
    const userId = auth.user.sub;

    const couple = await findActivatedCoupleForUser(prisma, userId);
    if (!couple) {
      return NextResponse.json(
        { error: 'NO_ACTIVE_COUPLE', message: 'You do not belong to an active Espace Couple.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const session = await prisma.gameSession.findFirst({
      where: { coupleId: couple.id, status: 'IN_PROGRESS' },
      select: CURRENT_SESSION_SELECT,
    });
    if (!session) {
      return NextResponse.json(
        { error: 'NO_ACTIVE_GAME', message: 'No game session is currently in progress.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const state: SessionPhaseState = {
      currentRoundNumber: session.currentRoundNumber,
      currentQuestionNumber: session.currentQuestionNumber,
      phase: session.phase,
      activePlayerRole: session.activePlayerRole,
      currentQuestionShownAt: session.currentQuestionShownAt,
    };
    const resolved = resolvePhaseOnRead(state);

    if (resolved.phase !== session.phase) {
      await prisma.gameSession.update({
        where: { id: session.id },
        data: { phase: resolved.phase },
      });
    }

    // One row per round of this session, ordered. The client needs every
    // round's length, not only the current one, to number a question across
    // the whole game ("Question 7 / 15").
    const rounds = await prisma.gameRound.findMany({
      where: { gameSessionId: session.id },
      orderBy: { roundNumber: 'asc' },
      select: { _count: { select: { questions: true } } },
    });

    const body: CurrentGameSessionResponse = {
      id: session.id,
      status: session.status,
      currentRoundNumber: resolved.currentRoundNumber,
      currentQuestionNumber: resolved.currentQuestionNumber,
      phase: resolved.phase,
      activePlayerRole: resolved.activePlayerRole,
      jokersRemainingCreator: session.jokersRemainingCreator,
      jokersRemainingPartner: session.jokersRemainingPartner,
      questionsPerRound: rounds.map((round) => round._count.questions),
    };

    if (resolved.phase === 'ANSWERING') {
      const gameRoundQuestion = await prisma.gameRoundQuestion.findFirst({
        where: {
          orderIndex: resolved.currentQuestionNumber - 1,
          gameRound: { gameSessionId: session.id, roundNumber: resolved.currentRoundNumber },
        },
        select: {
          question: { select: { id: true, roundType: true, prompt: true, options: true } },
        },
      });
      if (!gameRoundQuestion) {
        throw new Error(
          `GET /api/games/current: no GameRoundQuestion found for session ${session.id} ` +
            `round ${resolved.currentRoundNumber} orderIndex ${resolved.currentQuestionNumber - 1}`,
        );
      }
      body.question = shapeQuestionForClient(gameRoundQuestion.question);
    }

    return NextResponse.json(body, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}
