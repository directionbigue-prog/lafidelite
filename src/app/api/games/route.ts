// POST /api/games — starts (or idempotently resumes) the couple's
// pass-and-play game session (Lot 2, Task 10).
//
// Every route in this lot is a thin persistence layer around Lot 1's pure
// engine modules (state-machine.ts / question-selection.ts) — this route
// never re-derives their logic, it only loads/persists rows around them.
//
// A couple may have at most one IN_PROGRESS GameSession at a time (enforced
// at the DB level by a raw-SQL partial unique index — see the GameSession
// doc comment in schema.prisma). This route is therefore idempotent by
// design: a second call while a session is already IN_PROGRESS returns
// that same session (200) instead of creating a new one, and a concurrent
// double-create that slips past the read below is caught as a Postgres
// P2002 unique violation and resolved by re-querying the winner's session
// (Design Decision 4) — never surfaced as a 500.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/server/middleware';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { selectQuestionsForRound, recordQuestionUsage } from '@/lib/server/game/question-selection';
import {
  formatById,
  questionsPerRound,
  DEFAULT_FORMAT_ID,
  type GameFormatId,
} from '@/lib/game/formats';
import { firstPlayerRoleForRound } from '@/lib/server/game/state-machine';
import {
  isFreeGameExempt,
  FREE_GAME_EXEMPT_ENV,
  partieOfferteDejaJouee,
} from '@/lib/server/game/free-game';
import { packDuCouple } from '@/lib/server/game/entitlements';
import { verifierThemes } from '@/lib/game/packs';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

// Round order fixed by the PRD: MIROIR (round 1) -> SCENARIO (round 2) ->
// FACEAFACE (round 3).
const ROUNDS: readonly { roundNumber: number; type: string }[] = [
  { roundNumber: 1, type: 'MIROIR' },
  { roundNumber: 2, type: 'SCENARIO' },
  { roundNumber: 3, type: 'FACEAFACE' },
];

interface GameSessionSummary {
  id: string;
  status: string;
  currentRoundNumber: number;
  currentQuestionNumber: number;
  phase: string;
  activePlayerRole: string;
}

const SESSION_SUMMARY_SELECT = {
  id: true,
  status: true,
  currentRoundNumber: true,
  currentQuestionNumber: true,
  phase: true,
  activePlayerRole: true,
} as const;

async function findInProgressGameSession(coupleId: string): Promise<GameSessionSummary | null> {
  return prisma.gameSession.findFirst({
    where: { coupleId, status: 'IN_PROGRESS' },
    select: SESSION_SUMMARY_SELECT,
  });
}

// Creating a session is ~15 statements (3 question draws, the usage bulk
// write, then the session + 3 rounds + 3 question batches). Prisma's default
// 5s interactive-transaction budget is comfortable locally and too tight
// against a remote Postgres, where every statement pays network latency and a
// serverless database may be cold — the transaction expires mid-write and the
// player gets a 500 on "Nouvelle partie" rather than anything actionable.
// The statement count itself is kept flat in question-selection.ts's
// recordQuestionUsage; this is the headroom on top of it, not a substitute.
/**
 * Optional theme selection. Bounded on purpose: an unbounded array would
 * let a caller push an arbitrarily large `IN` set through the draw, and
 * there is no legitimate selection larger than the bank itself.
 */
const CreateGameBody = z.object({
  categories: z.array(z.string().min(1).max(120)).max(32).optional(),
  // An unknown format is refused rather than coerced to the default: a
  // couple who asked for thirty questions must not silently get fifteen.
  format: z.enum(['EXPRESS', 'STANDARD', 'LONGUE_SOIREE']).optional(),
});

const CREATE_SESSION_TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

/**
 * Themes the couple picked, if any. Passed to every round’s draw, where
 * `narrowToCategories` decides per round whether the restriction can be
 * honoured — the bank’s categories are scoped per round type, so a
 * selection that shapes one round routinely matches nothing in another.
 */
async function createGameSession(
  coupleId: string,
  categories?: string[],
  formatId: GameFormatId = DEFAULT_FORMAT_ID,
): Promise<GameSessionSummary> {
  // A format decides only LENGTH: every format still plays the three
  // manches, so the total is distributed across them rather than used to
  // drop any. Express is 2 / 2 / 1.
  const format = formatById(formatId) ?? formatById(DEFAULT_FORMAT_ID);
  const perRoundCounts = questionsPerRound(format?.totalQuestions ?? 15, ROUNDS.length);
  return prisma.$transaction(async (tx) => {
    // Accumulate ids across rounds so no question repeats within one
    // session — each round's draw excludes every id already picked by an
    // earlier round in this same creation.
    const allQuestionIds: string[] = [];
    const perRound: { roundNumber: number; type: string; questionIds: string[] }[] = [];

    for (const [index, { roundNumber, type }] of ROUNDS.entries()) {
      // `?? 5` is unreachable while ROUNDS has three entries and every
      // format has at least three questions, but `noUncheckedIndexedAccess`
      // is right to insist: a missing count would silently deal a round of
      // NaN questions.
      const count = perRoundCounts[index] ?? 5;
      const questions = await selectQuestionsForRound(tx, {
        coupleId,
        roundType: type,
        count,
        excludeQuestionIds: allQuestionIds.slice(),
        ...(categories && categories.length > 0 ? { categories } : {}),
      });
      const questionIds = questions.map((q) => q.id);
      allQuestionIds.push(...questionIds);
      perRound.push({ roundNumber, type, questionIds });
    }

    await recordQuestionUsage(tx, coupleId, allQuestionIds);

    const session = await tx.gameSession.create({
      data: {
        coupleId,
        activePlayerRole: firstPlayerRoleForRound(1),
      },
      select: SESSION_SUMMARY_SELECT,
    });

    for (const { roundNumber, type, questionIds } of perRound) {
      // Round 1 begins play immediately (no separate "start round 1"
      // action exists); rounds 2-3 stay PENDING until
      // POST /start-turn flips them when their first question is shown
      // (Design Decision 2).
      const isFirstRound = roundNumber === 1;
      const round = await tx.gameRound.create({
        data: {
          gameSessionId: session.id,
          roundNumber,
          type,
          firstPlayerRole: firstPlayerRoleForRound(roundNumber),
          status: isFirstRound ? 'IN_PROGRESS' : 'PENDING',
          startedAt: isFirstRound ? new Date() : null,
        },
        select: { id: true },
      });
      await tx.gameRoundQuestion.createMany({
        data: questionIds.map((questionId, orderIndex) => ({
          gameRoundId: round.id,
          questionId,
          orderIndex,
        })),
      });
    }

    return session;
  }, CREATE_SESSION_TX_OPTIONS);
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
    const userId = auth.user.sub;

    // The body is OPTIONAL and stays optional: "Nouvelle partie" with no
    // theme choice is still the whole game, and every client that shipped
    // before theme selection sends no body at all. An unparsable or absent
    // body therefore means "no themes", never an error.
    const body: unknown = await req.json().catch(() => ({}));
    const parsed = CreateGameBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_CATEGORIES', message: 'Invalid theme selection.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const couple = await findActivatedCoupleForUser(prisma, userId);
    if (!couple) {
      return NextResponse.json(
        { error: 'NO_ACTIVE_COUPLE', message: 'You do not belong to an active Espace Couple.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!couple.disclaimerAcceptedByCreatorAt || !couple.disclaimerAcceptedByPartnerAt) {
      return NextResponse.json(
        {
          error: 'DISCLAIMER_REQUIRED',
          message: 'Both partners must accept the disclaimer before playing.',
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await findInProgressGameSession(couple.id);
    if (existing) {
      // Resuming is free, always. The claim below sits AFTER this on
      // purpose: a couple who reloads mid-game, or opens a second tab,
      // must not spend a second entitlement on the game they are already
      // playing.
      return NextResponse.json(existing, {
        status: 200,
        headers: { 'x-request-id': ctx.requestId },
      });
    }

    // ── Le palier d'accès ────────────────────────────────────────────
    // Résolu ICI et non côté client : le sélecteur grise les thèmes
    // fermés, mais un grisage est une politesse, pas une serrure — la
    // requête se forge à la main en trois secondes.
    //
    // Placé APRÈS la reprise ci-dessus, pour que l'expiration d'un pack
    // n'enferme pas un couple hors d'une partie déjà commencée : on
    // n'abandonne pas quelqu'un au milieu de la manche 2.
    const pack = await packDuCouple(prisma, couple);
    const verdict = verifierThemes(pack, parsed.data.categories ?? []);
    if (verdict.refuses.length > 0) {
      // Refus explicite plutôt que retrait silencieux. Retirer les thèmes
      // fermés et jouer quand même reproduirait exactement le défaut que
      // le lot des thèmes a supprimé : une sélection ignorée, une partie
      // qui parle d'autre chose, et personne pour s'en apercevoir.
      return NextResponse.json(
        {
          error: 'THEME_LOCKED',
          message: 'Votre palier n’ouvre pas tous les thèmes demandés.',
          themes: verdict.refuses,
          pack: pack.id,
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // ── The one free game ────────────────────────────────────────────
    // Claimed as a conditional UPDATE rather than read-then-write: two
    // tabs pressing "Nouvelle partie" together would both pass a read,
    // and the account would get two free games. `updateMany` with
    // `freeGameUsedAt: null` in the WHERE lets exactly one of them win,
    // and the loser sees count 0 — the same atomic-claim shape the outbox
    // dispatcher uses.
    //
    // Un pack payant en cours dispense de cette règle : la partie offerte
    // sert à essayer avant d'acheter, et la refuser à quelqu'un qui vient
    // de payer 9 900 FCFA pour une seule partie serait le défaut le plus
    // coûteux que cette route puisse avoir.
    const exempt =
      pack.prix > 0 || isFreeGameExempt(auth.user.email, process.env[FREE_GAME_EXEMPT_ENV]);
    // The exact instant written, so the release below can prove it is
    // giving back its OWN claim and not somebody else's.
    let claimedAt: Date | null = null;
    if (!exempt) {
      // Une partie offerte par COUPLE : si l'autre l'a déjà jouée depuis son
      // compte, celui-ci n'en a plus. Deux partenaires qui lancent en même
      // temps depuis deux téléphones passent tous deux ce contrôle, mais
      // l'index partiel « une partie en cours par couple » ne laisse naître
      // qu'une session, et le perdant rend sa réclamation plus bas.
      const partenaireId = couple.creatorId === userId ? couple.partnerId : couple.creatorId;
      const partenaire = partenaireId
        ? await prisma.user.findUnique({
            where: { id: partenaireId },
            select: { freeGameUsedAt: true },
          })
        : null;
      if (partieOfferteDejaJouee(partenaire?.freeGameUsedAt)) {
        return NextResponse.json(
          {
            error: 'FREE_GAME_USED',
            message: 'This couple has already used its free game.',
          },
          { status: 402, headers: { 'x-request-id': ctx.requestId } },
        );
      }

      const claimedNowAt = new Date();
      const claim = await prisma.user.updateMany({
        where: { id: userId, freeGameUsedAt: null },
        data: { freeGameUsedAt: claimedNowAt },
      });
      if (claim.count === 0) {
        return NextResponse.json(
          {
            error: 'FREE_GAME_USED',
            message: 'This account has already used its free game.',
          },
          { status: 402, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      claimedAt = claimedNowAt;
    }

    // Give the claim back if no game came of it. Without this, a failed
    // creation would spend the entitlement on nothing — the user is
    // charged for a game that does not exist and cannot be resumed.
    const releaseClaim = async () => {
      if (claimedAt === null) return;
      // Scoped to the exact timestamp this request wrote. An unconditional
      // `where: { id: userId }` would also clear a claim made by a LATER
      // request — handing out a second free game to whoever raced in
      // while this one was failing. The narrow WHERE makes that
      // impossible: if the column no longer holds our value, the claim is
      // not ours to release, and the update matches nothing.
      await prisma.user.updateMany({
        where: { id: userId, freeGameUsedAt: claimedAt },
        data: { freeGameUsedAt: null },
      });
    };

    let session: GameSessionSummary;
    try {
      session = await createGameSession(couple.id, verdict.categories, parsed.data.format);
    } catch (err) {
      // Design Decision 4: the DB-level partial unique index makes a
      // concurrent double-create impossible; the loser sees P2002 here and
      // resolves it by re-reading the winner's session instead of 500ing.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const resumed = await findInProgressGameSession(couple.id);
        if (resumed) {
          // The concurrent loser: the winner's session is what the caller
          // gets, and this request created nothing, so it owes nothing.
          await releaseClaim();
          return NextResponse.json(resumed, {
            status: 200,
            headers: { 'x-request-id': ctx.requestId },
          });
        }
      }
      await releaseClaim();
      throw err;
    }

    return NextResponse.json(session, { status: 201, headers: { 'x-request-id': ctx.requestId } });
  });
}
