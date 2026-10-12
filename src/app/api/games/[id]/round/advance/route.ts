// POST /api/games/:id/round/advance — leaves the between-rounds reveal
// screen (Lot 2, Task 14).
//
// Only valid while phase === 'ROUND_REVEAL' (409 NOT_IN_ROUND_REVEAL
// otherwise, mirroring /answers' and /skip's phase guards). Two outcomes,
// decided by advanceRound():
//   - rounds 1->2 and 2->3: persist the advanced state (phase 'ROUND_INTRO',
//     question number reset to 1, activePlayerRole = that round's starter).
//   - round 3: the game is over. Compute the couple's immutable GameResult,
//     bank it, and close the session — all in ONE transaction.
//
// Design Decision 2 (deviation from the task brief's literal step 3): the
// brief says this route should also flip the NEXT GameRound to
// 'IN_PROGRESS'. It deliberately does NOT. POST /start-turn already owns
// that flip ("rounds 2-3 stay PENDING until their first question is
// actually shown", start-turn/route.ts), and duplicating it here would make
// two routes fight over the same column — the next round is left PENDING
// and start-turn promotes it when the first question of that round is
// actually served.
//
// The final-round branch is the ONE place in all of Lot 2 that reads raw
// `Question.options[].weight`. That weight resolves a SCENARIO OWN answer's
// fidelity contribution and MUST NEVER reach the HTTP response — only the
// computed GameResultComputation fields are ever serialized out. A
// SCENARIO OWN answer whose selected option (or that option's weight) can't
// be resolved is a genuine data-integrity violation and throws loudly: a
// 500 is correct, because defaulting to 0 would silently corrupt a couple's
// permanently-stored fidelity score.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { loadOwnedGameSession } from '@/lib/server/game/session-helpers';
import { advanceRound, type SessionPhaseState } from '@/lib/server/game/state-machine';
import { computeGameResult, type ScoredAnswer } from '@/lib/server/game/scoring';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

interface RawOption {
  id: string;
  text: string;
  weight?: number;
}

// Structural shape of the Answer rows loaded for scoring. Prisma's
// generated type for the findMany below is assignable to this.
interface AnswerRowForScoring {
  userId: string;
  kind: string;
  selectedOptionId: string | null;
  isSkipped: boolean;
  effectiveElapsedMs: number;
  gameRoundQuestion: {
    gameRound: { type: string };
    question: { id: string; options: unknown };
  };
}

const ROUND_TYPES = ['MIROIR', 'SCENARIO', 'FACEAFACE'] as const;
type RoundType = (typeof ROUND_TYPES)[number];

function isRoundType(value: string): value is RoundType {
  return (ROUND_TYPES as readonly string[]).includes(value);
}

/**
 * Maps one persisted Answer row to the scoring module's input shape,
 * resolving `optionWeight` from raw Question.options for the SCENARIO OWN
 * rows that need it. Throws on any shape it cannot resolve — every throw
 * here means Lot 2's own data is inconsistent, never a user-facing case.
 */
function toScoredAnswer(row: AnswerRowForScoring, gameSessionId: string): ScoredAnswer {
  const roundType = row.gameRoundQuestion.gameRound.type;
  if (!isRoundType(roundType)) {
    throw new Error(
      `POST /api/games/${gameSessionId}/round/advance: unknown GameRound.type '${roundType}'`,
    );
  }
  if (row.kind !== 'OWN' && row.kind !== 'PREDICTION') {
    throw new Error(
      `POST /api/games/${gameSessionId}/round/advance: unknown Answer.kind '${row.kind}'`,
    );
  }

  const questionId = row.gameRoundQuestion.question.id;
  const scored: ScoredAnswer = {
    questionId,
    roundType,
    userId: row.userId,
    kind: row.kind,
    selectedOptionId: row.selectedOptionId,
    isSkipped: row.isSkipped,
    effectiveElapsedMs: row.effectiveElapsedMs,
  };

  // The one raw-weight read in Lot 2. computeGameResult throws if a
  // non-skipped SCENARIO OWN answer arrives without optionWeight, so this
  // branch must resolve it or fail loudly here with a better message.
  if (roundType === 'SCENARIO' && row.kind === 'OWN' && !row.isSkipped) {
    const options = row.gameRoundQuestion.question.options as RawOption[] | null;
    const selected = Array.isArray(options)
      ? options.find((o) => o.id === row.selectedOptionId)
      : undefined;
    if (!selected || typeof selected.weight !== 'number') {
      throw new Error(
        `POST /api/games/${gameSessionId}/round/advance: cannot resolve option weight for ` +
          `SCENARIO question ${questionId}, selectedOptionId '${String(row.selectedOptionId)}'`,
      );
    }
    scored.optionWeight = selected.weight;
  }

  return scored;
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

    if (session.phase !== 'ROUND_REVEAL') {
      return NextResponse.json(
        {
          error: 'NOT_IN_ROUND_REVEAL',
          message: `Cannot advance the round from phase '${session.phase}'.`,
        },
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
    const { state: next, gameCompleted } = advanceRound(state);

    if (!gameCompleted) {
      await prisma.gameSession.update({
        where: { id: session.id },
        data: {
          phase: next.phase,
          activePlayerRole: next.activePlayerRole,
          currentRoundNumber: next.currentRoundNumber,
          currentQuestionNumber: next.currentQuestionNumber,
          currentQuestionShownAt: next.currentQuestionShownAt,
        },
      });

      // The next GameRound is deliberately left PENDING here — see the
      // Design Decision 2 note at the top of this file.
      return NextResponse.json(
        {
          phase: next.phase,
          currentRoundNumber: next.currentRoundNumber,
          activePlayerRole: next.activePlayerRole,
          gameCompleted: false,
        },
        { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Invariant: a game can only exist for an ACTIVE (paired) couple, so
    // partnerId is guaranteed non-null here — TypeScript doesn't know that
    // from ActivatedCouple's shape alone.
    const partnerId = couple.partnerId;
    if (!partnerId) {
      throw new Error(
        `POST /api/games/${session.id}/round/advance: couple ${couple.id} has no partnerId while a game is in progress`,
      );
    }

    const now = new Date();

    try {
      await prisma.$transaction(async (tx) => {
        // Answer.gameSessionId is denormalized precisely so this
        // session-wide read needs no deep join back through rounds.
        const rows = await tx.answer.findMany({
          where: { gameSessionId: session.id },
          include: { gameRoundQuestion: { include: { gameRound: true, question: true } } },
        });

        const answers = rows.map((row) => toScoredAnswer(row, session.id));

        const result = computeGameResult({
          creatorId: couple.creatorId,
          partnerId,
          cumulativeCoupleScoreBeforeThisGame: couple.cumulativeCoupleScore,
          answers,
        });

        // creatorTitle/partnerTitle are intentionally NOT persisted: the
        // GameResult model has no columns for them because they are pure
        // derivations of winnerRole, re-derived at read time by the results
        // route (Task 15).
        await tx.gameResult.create({
          data: {
            gameSessionId: session.id,
            coupleScore: result.coupleScore,
            complicityLevel: result.complicityLevel,
            creatorTotalScore: result.creatorTotalScore,
            partnerTotalScore: result.partnerTotalScore,
            creatorMirrorPoints: result.creatorMirrorPoints,
            partnerMirrorPoints: result.partnerMirrorPoints,
            creatorFidelityScore: result.creatorFidelityScore,
            partnerFidelityScore: result.partnerFidelityScore,
            alignmentPointsShared: result.alignmentPointsShared,
            creatorSpeedBonus: result.creatorSpeedBonus,
            partnerSpeedBonus: result.partnerSpeedBonus,
            gapPercent: result.gapPercent,
            gapMasked: result.gapMasked,
            winnerRole: result.winnerRole,
            conversationPrompts: result.conversationPrompts,
          },
        });

        await tx.couple.update({
          where: { id: couple.id },
          data: { cumulativeCoupleScore: { increment: result.coupleScore } },
        });

        await tx.gameSession.update({
          where: { id: session.id },
          data: { status: 'COMPLETED', completedAt: now, phase: 'COMPLETE' },
        });
      });
    } catch (err) {
      // Idempotent double-submit/race: GameResult.gameSessionId is unique,
      // so a second concurrent completion loses the insert and the WHOLE
      // transaction rolls back — critically including the
      // cumulativeCoupleScore increment, so the couple is never
      // double-banked. The winning request already persisted everything, so
      // report the same COMPLETE outcome rather than a spurious 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return NextResponse.json(
          { phase: 'COMPLETE', gameCompleted: true },
          { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
      throw err;
    }

    // Only the computed result fields are ever exposed; raw option weights
    // stay server-side. The full breakdown is served by Task 15's results
    // route.
    return NextResponse.json(
      { phase: 'COMPLETE', gameCompleted: true },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
