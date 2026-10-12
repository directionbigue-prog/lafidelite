// Shared GameSession row loader for the /api/games/* route family (Lot 2,
// Tasks 10-15). `loadOwnedGameSession` is the single "does this session
// belong to this couple" chokepoint: scoping the lookup to
// `{ id: gameSessionId, coupleId }` means a session that exists but belongs
// to a different couple naturally comes back `null`, exactly like a
// not-found session — callers turn that into a 404, never a 403, matching
// this lot's Design Decision 5 (never leak a session's existence to a
// couple that doesn't own it).
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';

type QueryClient = PrismaClient | Prisma.TransactionClient;

export interface GameSessionRow {
  id: string;
  coupleId: string;
  status: string;
  currentRoundNumber: number;
  currentQuestionNumber: number;
  phase: string;
  activePlayerRole: string;
  currentQuestionShownAt: Date | null;
  jokersRemainingCreator: number;
  jokersRemainingPartner: number;
  startedAt: Date;
  completedAt: Date | null;
}

const GAME_SESSION_ROW_SELECT = {
  id: true,
  coupleId: true,
  status: true,
  currentRoundNumber: true,
  currentQuestionNumber: true,
  phase: true,
  activePlayerRole: true,
  currentQuestionShownAt: true,
  jokersRemainingCreator: true,
  jokersRemainingPartner: true,
  startedAt: true,
  completedAt: true,
} as const;

export async function loadOwnedGameSession(
  client: QueryClient,
  coupleId: string,
  gameSessionId: string,
): Promise<GameSessionRow | null> {
  return client.gameSession.findFirst({
    where: { id: gameSessionId, coupleId },
    select: GAME_SESSION_ROW_SELECT,
  });
}

/**
 * How many questions the given round actually holds.
 *
 * The round IS its questions: `createGameSession` writes as many rows as the
 * chosen format calls for, and Express writes 2 / 2 / 1, so rounds within a
 * single game can differ in length. Counting the rows is therefore both the
 * simplest answer and the most robust one — it cannot disagree with what was
 * dealt, which a re-derivation from the session's format could.
 *
 * Shared rather than inlined in each route: `answers` and `skip` must reach
 * the same conclusion about when a round ends, and two copies of that
 * decision is precisely the drift this codebase keeps paying for.
 */
export async function countQuestionsInRound(
  client: QueryClient,
  gameRoundId: string,
): Promise<number> {
  return client.gameRoundQuestion.count({ where: { gameRoundId } });
}
