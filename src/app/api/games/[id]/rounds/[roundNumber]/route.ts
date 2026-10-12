// GET /api/games/:id/rounds/:roundNumber — both players' answers (and, for
// a MIROIR round, both predictions) for one COMPLETED round of a game
// session, for the post-round reveal screen (Lot 2, Task 15).
//
// Read-only: `requireAuth` only, no `verifyCsrf` — CSRF protects mutations,
// this is a GET.
//
// Design Decision 5 (never leak existence) governs every 404 branch below:
//   - A session that doesn't exist, or belongs to another couple, comes
//     back `null` from `loadOwnedGameSession` (scoped to the caller's
//     couple) and is reported as GAME_SESSION_NOT_FOUND.
//   - A round that doesn't exist, and a round that exists but is not yet
//     COMPLETED (still PENDING or IN_PROGRESS — i.e. the partner hasn't
//     finished answering), collapse into the SAME ROUND_NOT_AVAILABLE 404.
//     Splitting these would let a peeking player learn "the round exists
//     but isn't done yet" — exactly the early-reveal leak this lot's
//     invariants forbid.
//
// `canRevealPartnerAnswer(round.status)` is called AGAIN, as its own
// statement right before the `.map` that shapes the response — a second,
// independent gate, not folded into the route guard's boolean expression
// above. That's deliberate: a defence-in-depth check only protects against
// a future edit to the primary guard if it lives somewhere that edit
// doesn't automatically touch. Today it is unreachable-by-construction
// (the guard above already enforces `round.status === 'COMPLETED'`), but it
// survives a later widening of that guard — e.g. adding an ABANDONED
// round-replay status — because it is a separate `if`, not a third operand
// ORed into the same condition (see this lot's Global Constraints).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { loadOwnedGameSession } from '@/lib/server/game/session-helpers';
import { TOTAL_ROUNDS } from '@/lib/server/game/state-machine';
import {
  shapeQuestionForClient,
  canRevealPartnerAnswer,
  type ClientOption,
} from '@/lib/server/game/response-shaping';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

interface AnswerShape {
  selectedOptionId: string | null;
  isSkipped: boolean;
}

// A skipped MIROIR OWN answer legitimately never gets a PREDICTION row
// (see skip/route.ts's doc comment: "a skipped MIROIR question simply
// never gets a PREDICTION row"), so a missing row here is not a
// data-integrity violation — it's reported the same as an explicit skip.
const MISSING_ANSWER: AnswerShape = { selectedOptionId: null, isSkipped: true };

interface AnswerRow {
  userId: string;
  kind: string;
  selectedOptionId: string | null;
  isSkipped: boolean;
}

function findAnswer(rows: AnswerRow[], userId: string, kind: 'OWN' | 'PREDICTION'): AnswerShape {
  const row = rows.find((r) => r.userId === userId && r.kind === kind);
  if (!row) return MISSING_ANSWER;
  return { selectedOptionId: row.selectedOptionId, isSkipped: row.isSkipped };
}

interface QuestionResultEntry {
  id: string;
  prompt: string;
  options: ClientOption[];
  creatorAnswer: AnswerShape;
  partnerAnswer: AnswerShape;
  creatorPrediction?: AnswerShape;
  partnerPrediction?: AnswerShape;
}

// Structural shape of one row loaded below — annotated explicitly (rather
// than inferred from the Prisma call) so the `.map` callback destructure
// doesn't fall back to implicit `any` under this repo's known Prisma-5.22 /
// TypeScript client-extension typing gap (see pre-existing-typecheck-baseline.txt).
interface GameRoundQuestionRow {
  question: { id: string; roundType: string; prompt: string; options: unknown };
  answers: AnswerRow[];
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; roundNumber: string }> },
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

    const { id, roundNumber: roundNumberParam } = await ctx.params;

    // Design Decision 5: a session that exists but belongs to a different
    // couple comes back null here too, and is reported identically to a
    // truly-missing session — never leak existence via a 403 vs 404 split.
    const session = await loadOwnedGameSession(prisma, couple.id, id);
    if (!session) {
      return NextResponse.json(
        { error: 'GAME_SESSION_NOT_FOUND', message: 'No such game session.' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Bounded, not merely integral. A value outside Postgres' int4 range
    // (a 20-digit URL segment is trivially typed by hand) reaches Prisma
    // as an out-of-range integer and throws, turning a bad URL into a 500
    // — a different, louder response than the uniform 404 every other
    // bad-input path returns here, and therefore a small existence oracle.
    // Rounds are 1-3; anything else is simply not found.
    const roundNumber = Number(roundNumberParam);
    const isQueryableRoundNumber =
      Number.isInteger(roundNumber) && roundNumber >= 1 && roundNumber <= TOTAL_ROUNDS;
    const round = isQueryableRoundNumber
      ? await prisma.gameRound.findFirst({
          where: { gameSessionId: session.id, roundNumber },
          select: { id: true, type: true, status: true },
        })
      : null;

    // A malformed/out-of-range roundNumber, a missing round, and a round
    // that is not yet COMPLETED all collapse into the same 404 — see the
    // Design Decision 5 note above the handler.
    if (!round || round.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'ROUND_NOT_AVAILABLE', message: 'This round has no results to show yet.' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Invariant: a game can only exist for an ACTIVE (paired) couple, so
    // partnerId is guaranteed non-null here — TypeScript doesn't know that
    // from ActivatedCouple's shape alone.
    const { creatorId, partnerId } = couple;
    if (!partnerId) {
      throw new Error(
        `GET /api/games/${session.id}/rounds/${roundNumberParam}: couple ${couple.id} has no partnerId while reading a completed round`,
      );
    }

    const gameRoundQuestions = await prisma.gameRoundQuestion.findMany({
      where: { gameRoundId: round.id },
      orderBy: { orderIndex: 'asc' },
      select: {
        question: { select: { id: true, roundType: true, prompt: true, options: true } },
        answers: {
          select: { userId: true, kind: true, selectedOptionId: true, isSkipped: true },
        },
      },
    });

    // Response-boundary re-assertion of the reveal invariant, INDEPENDENT
    // of the route guard above (see the header comment). Unreachable today
    // by construction — the guard already enforced round.status ===
    // 'COMPLETED' — but deliberately kept as its own statement so a future
    // widening of that guard cannot silently start serializing a
    // non-COMPLETED round's partner answers.
    if (!canRevealPartnerAnswer(round.status)) {
      return NextResponse.json(
        { error: 'ROUND_NOT_AVAILABLE', message: 'This round has no results to show yet.' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const isMirror = round.type === 'MIROIR';

    const rows: GameRoundQuestionRow[] = gameRoundQuestions;
    const questions: QuestionResultEntry[] = rows.map(({ question, answers }) => {
      const shaped = shapeQuestionForClient(question);
      return {
        id: shaped.id,
        prompt: shaped.prompt,
        options: shaped.options,
        creatorAnswer: findAnswer(answers, creatorId, 'OWN'),
        partnerAnswer: findAnswer(answers, partnerId, 'OWN'),
        ...(isMirror
          ? {
              creatorPrediction: findAnswer(answers, creatorId, 'PREDICTION'),
              partnerPrediction: findAnswer(answers, partnerId, 'PREDICTION'),
            }
          : {}),
      };
    });

    return NextResponse.json(
      { roundNumber, type: round.type, questions },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
