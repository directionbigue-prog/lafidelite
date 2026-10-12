// POST /api/games/:id/answers — records the active player's answer(s) for
// the current question and advances the turn (Lot 2, Task 12).
//
// Only valid while `phase === 'ANSWERING'` (stamped by POST
// /api/games/:id/start-turn); anything else is rejected with 409
// NOT_ANSWERING_PHASE. Which request-body shape is expected depends on the
// CURRENT round's type, not on the request itself, so the round/question
// are loaded BEFORE the body is parsed:
//   - MIROIR: { ownOptionId, predictionOptionId, clientElapsedMs? } — two
//     Answer rows (kind:'OWN' + kind:'PREDICTION'), same effectiveElapsedMs.
//   - SCENARIO / FACEAFACE: { optionId, clientElapsedMs? } — one Answer row
//     (kind:'OWN').
//
// Idempotent by design: a double-submit/retry for the same
// (gameRoundQuestionId, userId, kind) hits the Answer model's
// @@unique([gameRoundQuestionId, userId, kind]) constraint. That P2002 is
// caught and treated as success (no re-insert) rather than surfaced as an
// error — the state read/advance below still runs so the response is
// consistent with the first successful call.
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

const MiroirBody = z.object({
  ownOptionId: z.string().min(1),
  predictionOptionId: z.string().min(1),
  clientElapsedMs: z.number().optional(),
});

const SingleOptionBody = z.object({
  optionId: z.string().min(1),
  clientElapsedMs: z.number().optional(),
});

interface RawOption {
  id: string;
  text: string;
  weight?: number;
}

interface AnswerRowInput {
  gameRoundQuestionId: string;
  gameSessionId: string;
  userId: string;
  kind: 'OWN' | 'PREDICTION';
  selectedOptionId: string;
  effectiveElapsedMs: number;
  clientElapsedMs: number | null;
}

async function insertAnswerRows(rows: AnswerRowInput[]): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.answer.createMany({ data: rows });
    });
  } catch (err) {
    // Idempotent double-submit/retry: the rows already exist from an
    // earlier call — fall through to the state read below instead of
    // erroring or inserting again.
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
          message: `Cannot submit an answer from phase '${session.phase}'.`,
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const round = await prisma.gameRound.findFirst({
      where: { gameSessionId: session.id, roundNumber: session.currentRoundNumber },
      select: { id: true, type: true },
    });
    if (!round) {
      throw new Error(
        `POST /api/games/${session.id}/answers: no GameRound found for round ${session.currentRoundNumber}`,
      );
    }

    const gameRoundQuestion = await prisma.gameRoundQuestion.findFirst({
      where: { gameRoundId: round.id, orderIndex: session.currentQuestionNumber - 1 },
      select: {
        id: true,
        question: { select: { id: true, roundType: true, prompt: true, options: true } },
      },
    });
    if (!gameRoundQuestion) {
      throw new Error(
        `POST /api/games/${session.id}/answers: no GameRoundQuestion found for round ` +
          `${session.currentRoundNumber} orderIndex ${session.currentQuestionNumber - 1}`,
      );
    }

    // `options` is a Prisma `Json` column, so its static type is the whole
    // JsonValue union — a direct cast to RawOption[] is not just noisy, it
    // would also throw on `.map` for any row whose JSON is not an array.
    // Narrow instead: a malformed row yields an empty id set, so every
    // submitted option id fails validation and the request is rejected as
    // INVALID_OPTION rather than 500-ing.
    const rawOptions = gameRoundQuestion.question.options;
    const options: RawOption[] = Array.isArray(rawOptions)
      ? (rawOptions as unknown as RawOption[])
      : [];
    const validOptionIds = new Set(options.map((o) => o.id));

    const json = await req.json().catch(() => null);
    const isMiroir = round.type === 'MIROIR';

    let submittedIds: string[];
    let clientElapsedMs: number | null;
    let buildRows: (
      gameRoundQuestionId: string,
      answerUserId: string,
      effectiveElapsedMs: number,
    ) => AnswerRowInput[];

    if (isMiroir) {
      const parsed = MiroirBody.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
          { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
      const { ownOptionId, predictionOptionId } = parsed.data;
      submittedIds = [ownOptionId, predictionOptionId];
      clientElapsedMs = parsed.data.clientElapsedMs ?? null;
      buildRows = (gameRoundQuestionId, answerUserId, effectiveElapsedMs) => [
        {
          gameRoundQuestionId,
          gameSessionId: session.id,
          userId: answerUserId,
          kind: 'OWN',
          selectedOptionId: ownOptionId,
          effectiveElapsedMs,
          clientElapsedMs,
        },
        {
          gameRoundQuestionId,
          gameSessionId: session.id,
          userId: answerUserId,
          kind: 'PREDICTION',
          selectedOptionId: predictionOptionId,
          effectiveElapsedMs,
          clientElapsedMs,
        },
      ];
    } else {
      const parsed = SingleOptionBody.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
          { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
      const { optionId } = parsed.data;
      submittedIds = [optionId];
      clientElapsedMs = parsed.data.clientElapsedMs ?? null;
      buildRows = (gameRoundQuestionId, answerUserId, effectiveElapsedMs) => [
        {
          gameRoundQuestionId,
          gameSessionId: session.id,
          userId: answerUserId,
          kind: 'OWN',
          selectedOptionId: optionId,
          effectiveElapsedMs,
          clientElapsedMs,
        },
      ];
    }

    for (const optionId of submittedIds) {
      if (!validOptionIds.has(optionId)) {
        return NextResponse.json(
          {
            error: 'INVALID_OPTION',
            message: `Option '${optionId}' does not exist for this question.`,
          },
          { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
    }

    // Invariant: a game can only exist for an ACTIVE (paired) couple, so
    // partnerId is guaranteed non-null here — TypeScript doesn't know that
    // from ActivatedCouple's shape alone.
    const answerUserId =
      session.activePlayerRole === 'CREATOR' ? couple.creatorId : couple.partnerId;
    if (!answerUserId) {
      throw new Error(
        `POST /api/games/${session.id}/answers: couple ${couple.id} has no partnerId while a game is in progress`,
      );
    }

    // Invariant: currentQuestionShownAt is always non-null while
    // phase === 'ANSWERING' (stamped by POST /start-turn, cleared on every
    // transition out of ANSWERING).
    if (!session.currentQuestionShownAt) {
      throw new Error(
        `POST /api/games/${session.id}/answers: currentQuestionShownAt is null while phase === 'ANSWERING'`,
      );
    }
    const serverElapsedMs = Date.now() - session.currentQuestionShownAt.getTime();
    const effectiveElapsedMs = computeEffectiveElapsedMs(clientElapsedMs, serverElapsedMs);

    const rows = buildRows(gameRoundQuestion.id, answerUserId, effectiveElapsedMs);
    await insertAnswerRows(rows);

    const ownAnswerCount = await prisma.answer.count({
      where: { gameRoundQuestionId: gameRoundQuestion.id, kind: 'OWN' },
    });
    if (ownAnswerCount !== 1 && ownAnswerCount !== 2) {
      throw new Error(
        `POST /api/games/${session.id}/answers: expected 1 or 2 OWN answers for GameRoundQuestion ` +
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

    return NextResponse.json(
      {
        phase: next.phase,
        activePlayerRole: next.activePlayerRole,
        currentRoundNumber: next.currentRoundNumber,
        currentQuestionNumber: next.currentQuestionNumber,
        roundCompleted,
      },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
