// POST /api/games/:id/skip — the active player forfeits the current
// question using one of their jokers (Lot 2, Task 13).
//
// Only valid while phase === 'ANSWERING' (409 NOT_ANSWERING_PHASE
// otherwise, mirroring /answers). Requires the active player to have at
// least one joker remaining — 0 jokers -> 403 NO_JOKERS_LEFT, writing
// nothing (no Answer row, no decrement, no round/question read).
//
// Per Design Decision 3 (Task 13 plan), a skip ALWAYS writes exactly one
// Answer row: kind:'OWN', isSkipped: true, selectedOptionId: null — for
// every round type, including MIROIR (a skipped MIROIR question simply
// never gets a PREDICTION row; scoring.ts's isUsableSelection already
// treats a missing/skipped counterpart as "no match" during scoring).
// effectiveElapsedMs is computed the same way as /answers but is unused
// by scoring for a skipped answer (scoring.ts's computeRawSpeedSum has an
// explicit `if (a.isSkipped) continue;`) — stored only for
// consistency/debugging.
//
// Idempotent by design, same as /answers: a duplicate/racing skip
// submission for the same (gameRoundQuestionId, userId, kind) hits the
// Answer model's @@unique([gameRoundQuestionId, userId, kind])
// constraint. To keep a P2002 from double-decrementing the joker count,
// the Answer insert runs FIRST inside the transaction — if it throws
// P2002 the whole transaction (insert + decrement) rolls back together,
// so only the winning request's decrement ever commits.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { loadOwnedGameSession, countQuestionsInRound } from '@/lib/server/game/session-helpers';
import { advanceAfterAnswer, type SessionPhaseState } from '@/lib/server/game/state-machine';
import { computeEffectiveElapsedMs } from '@/lib/server/game/scoring';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const SkipBody = z.object({
  clientElapsedMs: z.number().optional(),
});

type JokerColumn = 'jokersRemainingCreator' | 'jokersRemainingPartner';

async function insertSkipAndDecrementJoker(input: {
  gameRoundQuestionId: string;
  gameSessionId: string;
  userId: string;
  effectiveElapsedMs: number;
  clientElapsedMs: number | null;
  jokerColumn: JokerColumn;
}): Promise<void> {
  const {
    gameRoundQuestionId,
    gameSessionId,
    userId,
    effectiveElapsedMs,
    clientElapsedMs,
    jokerColumn,
  } = input;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.answer.create({
        data: {
          gameRoundQuestionId,
          gameSessionId,
          userId,
          kind: 'OWN',
          selectedOptionId: null,
          isSkipped: true,
          effectiveElapsedMs,
          clientElapsedMs,
        },
      });
      await tx.gameSession.update({
        where: { id: gameSessionId },
        data: { [jokerColumn]: { decrement: 1 } },
      });
    });
  } catch (err) {
    // Idempotent double-submit/race: the Answer row already exists from a
    // concurrent/earlier call. The whole transaction (including the
    // decrement) rolled back, so no joker was consumed by THIS attempt —
    // fall through to the state read below instead of erroring or
    // re-inserting.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return;
    }
    throw err;
  }
}

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
    const userIdFromAuth = auth.user.sub;

    const couple = await findActivatedCoupleForUser(prisma, userIdFromAuth);
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

    if (session.phase !== 'ANSWERING') {
      return NextResponse.json(
        {
          error: 'NOT_ANSWERING_PHASE',
          message: `Cannot skip a question from phase '${session.phase}'.`,
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const jokerColumn: JokerColumn =
      session.activePlayerRole === 'CREATOR' ? 'jokersRemainingCreator' : 'jokersRemainingPartner';
    const jokerCountBefore =
      session.activePlayerRole === 'CREATOR'
        ? session.jokersRemainingCreator
        : session.jokersRemainingPartner;
    if (jokerCountBefore === 0) {
      return NextResponse.json(
        { error: 'NO_JOKERS_LEFT', message: 'No jokers remaining for the active player.' },
        { status: 403, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const round = await prisma.gameRound.findFirst({
      where: { gameSessionId: session.id, roundNumber: session.currentRoundNumber },
      select: { id: true },
    });
    if (!round) {
      throw new Error(
        `POST /api/games/${session.id}/skip: no GameRound found for round ${session.currentRoundNumber}`,
      );
    }

    const gameRoundQuestion = await prisma.gameRoundQuestion.findFirst({
      where: { gameRoundId: round.id, orderIndex: session.currentQuestionNumber - 1 },
      select: { id: true },
    });
    if (!gameRoundQuestion) {
      throw new Error(
        `POST /api/games/${session.id}/skip: no GameRoundQuestion found for round ` +
          `${session.currentRoundNumber} orderIndex ${session.currentQuestionNumber - 1}`,
      );
    }

    // Invariant: a game can only exist for an ACTIVE (paired) couple, so
    // partnerId is guaranteed non-null here — TypeScript doesn't know that
    // from ActivatedCouple's shape alone.
    const answerUserId =
      session.activePlayerRole === 'CREATOR' ? couple.creatorId : couple.partnerId;
    if (!answerUserId) {
      throw new Error(
        `POST /api/games/${session.id}/skip: couple ${couple.id} has no partnerId while a game is in progress`,
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = SkipBody.safeParse(json ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const clientElapsedMs = parsed.data.clientElapsedMs ?? null;

    // Invariant: currentQuestionShownAt is always non-null while
    // phase === 'ANSWERING' (stamped by POST /start-turn, cleared on every
    // transition out of ANSWERING).
    if (!session.currentQuestionShownAt) {
      throw new Error(
        `POST /api/games/${session.id}/skip: currentQuestionShownAt is null while phase === 'ANSWERING'`,
      );
    }
    const serverElapsedMs = Date.now() - session.currentQuestionShownAt.getTime();
    const effectiveElapsedMs = computeEffectiveElapsedMs(clientElapsedMs, serverElapsedMs);

    await insertSkipAndDecrementJoker({
      gameRoundQuestionId: gameRoundQuestion.id,
      gameSessionId: session.id,
      userId: answerUserId,
      effectiveElapsedMs,
      clientElapsedMs,
      jokerColumn,
    });

    const ownAnswerCount = await prisma.answer.count({
      where: { gameRoundQuestionId: gameRoundQuestion.id, kind: 'OWN' },
    });
    if (ownAnswerCount !== 1 && ownAnswerCount !== 2) {
      throw new Error(
        `POST /api/games/${session.id}/skip: expected 1 or 2 OWN answers for GameRoundQuestion ` +
          `${gameRoundQuestion.id}, got ${ownAnswerCount}`,
      );
    }

    const state: SessionPhaseState = {
      currentRoundNumber: session.currentRoundNumber,
      currentQuestionNumber: session.currentQuestionNumber,
      phase: session.phase,
      activePlayerRole: session.activePlayerRole,
      currentQuestionShownAt: session.currentQuestionShownAt,
    };
    // The round’s length comes from the round itself, not from a constant:
    // a game’s format decides how many questions each manche holds, and
    // Express deals 2 / 2 / 1.
    const questionsInRound = await countQuestionsInRound(prisma, round.id);
    const { state: next, roundCompleted } = advanceAfterAnswer(
      state,
      ownAnswerCount,
      questionsInRound,
    );

    await prisma.gameSession.update({
      where: { id: session.id },
      data: {
        phase: next.phase,
        activePlayerRole: next.activePlayerRole,
        currentQuestionNumber: next.currentQuestionNumber,
        currentQuestionShownAt: next.currentQuestionShownAt,
      },
    });

    if (roundCompleted) {
      await prisma.gameRound.update({
        where: { id: round.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    }

    // Only one decrement ever actually commits, regardless of whether THIS
    // request won the insert race (see insertSkipAndDecrementJoker) — the
    // pre-decrement count minus 1 is therefore always the correct
    // post-decrement value to report.
    const jokersRemaining = jokerCountBefore - 1;

    return NextResponse.json(
      {
        phase: next.phase,
        activePlayerRole: next.activePlayerRole,
        currentRoundNumber: next.currentRoundNumber,
        currentQuestionNumber: next.currentQuestionNumber,
        roundCompleted,
        jokersRemaining,
      },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
