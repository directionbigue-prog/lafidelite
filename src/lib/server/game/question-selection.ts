// Anti-repetition question draw for a game round (PRD §5.4 — "banque de
// questions" should not feel repetitive across replays). Rule: a category
// is "exhausted" once the couple has played >= 80% of its questions; an
// exhausted category becomes fully eligible again (including its
// already-played questions) rather than blocking the round.
import 'server-only';
import crypto from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';

type QueryClient = PrismaClient | Prisma.TransactionClient;

export interface SelectQuestionsParams {
  coupleId: string;
  roundType: string;
  count: number;
  excludeQuestionIds?: string[];
  /**
   * Restrict the draw to these categories — the themes the couple chose.
   * Empty or omitted means the whole bank for this round type.
   *
   * The restriction is a PREFERENCE, not a guarantee, and deliberately so:
   * see `narrowToCategories`.
   */
  categories?: string[];
}

function shuffleAndTake<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const result: T[] = [];
  while (result.length < count && pool.length > 0) {
    const idx = crypto.randomInt(0, pool.length);
    result.push(pool.splice(idx, 1)[0] as T);
  }
  return result;
}

type UsageRow = { questionId: string; timesPlayed: number; lastPlayedAt: Date };

/**
 * Orders `eligible` so less-played questions are preferred over more-played
 * ones, then takes the first `count`. Preserves the "exhausted category
 * becomes fully eligible again" rule (every question in `eligible` — played
 * or not — remains a candidate) while fixing the bug where an exhausted
 * category's uniform-random draw could keep re-picking questions played
 * seconds ago over ones played long ago or never.
 *
 * Tiering: group by timesPlayed (never-played questions have no
 * QuestionUsage row -> default 0, naturally the lowest tier), sort tiers
 * ascending, and within a tier sort by lastPlayedAt ascending (oldest
 * first; never-played questions have no lastPlayedAt and sort before any
 * played question in their tier). Ties within a tier (e.g. all-never-played)
 * are shuffled for fairness rather than left in a fixed DB-fetch order.
 */
function tieredSelect<T extends { id: string }>(
  eligible: T[],
  usageByQuestion: Map<string, UsageRow>,
  count: number,
): T[] {
  const tiers = new Map<number, T[]>();
  for (const q of eligible) {
    const timesPlayed = usageByQuestion.get(q.id)?.timesPlayed ?? 0;
    const list = tiers.get(timesPlayed);
    if (list) {
      list.push(q);
    } else {
      tiers.set(timesPlayed, [q]);
    }
  }

  const sortedTierKeys = [...tiers.keys()].sort((a, b) => a - b);

  const ordered: T[] = [];
  for (const key of sortedTierKeys) {
    const tierItems = tiers.get(key) as T[];
    const withTime = tierItems.map((q) => ({
      q,
      time: usageByQuestion.get(q.id)?.lastPlayedAt?.getTime(),
    }));
    const neverPlayed = shuffleAndTake(
      withTime.filter((w) => w.time === undefined).map((w) => w.q),
      Number.MAX_SAFE_INTEGER,
    );
    const played = withTime
      .filter((w) => w.time !== undefined)
      .sort((a, b) => (a.time as number) - (b.time as number))
      .map((w) => w.q);
    // Never-played questions in this tier sort before any played question.
    ordered.push(...neverPlayed, ...played);
  }

  return ordered.slice(0, count);
}

/**
 * Narrows a round’s pool to the chosen categories — but only when the
 * narrowed pool can still FILL the round.
 *
 * This is the whole judgement call of theme selection. A round is exactly
 * `count` questions; a pool that cannot supply them leaves the round short,
 * and a short round is not a smaller game, it is a broken one.
 *
 * The bank’s categories are scoped PER ROUND TYPE (MIROIR has
 * "Communication", SCENARIO has "Confiance & Jalousie", and so on), so a
 * couple picking two themes will routinely pick none that exist for one of
 * the three rounds. Widening that round back to its full pool is the only
 * behaviour that still yields a playable game — and it is why the parameter
 * is documented as a preference rather than a filter.
 *
 * Exported for tests: this rule deserves pinning directly rather than being
 * inferred from the outcome of a random draw.
 */
export function narrowToCategories<T extends { id: string; category: string }>(
  questions: T[],
  categories: readonly string[] | undefined,
  count: number,
  excludeSet: ReadonlySet<string> = new Set<string>(),
): { pool: T[]; narrowed: boolean } {
  if (!categories || categories.length === 0) return { pool: questions, narrowed: false };
  const wanted = new Set(categories);
  const scoped = questions.filter((q) => wanted.has(q.category));
  const usable = scoped.filter((q) => !excludeSet.has(q.id)).length;
  return usable >= count ? { pool: scoped, narrowed: true } : { pool: questions, narrowed: false };
}

export async function selectQuestionsForRound(
  client: QueryClient,
  { coupleId, roundType, count, excludeQuestionIds = [], categories }: SelectQuestionsParams,
): Promise<{ id: string }[]> {
  const excludeSet = new Set(excludeQuestionIds);

  const allForRound = await client.question.findMany({
    where: { roundType, active: true },
    select: { id: true, category: true },
  });

  // One query, then narrow in memory. Filtering in SQL would need a second
  // round trip to discover that the narrowed pool is too small, and this runs
  // inside the session-creation transaction whose wall clock is already the
  // reason `recordQuestionUsage` batches its writes.
  const { pool: questions } = narrowToCategories(allForRound, categories, count, excludeSet);

  const usages = await client.questionUsage.findMany({
    where: { coupleId },
    select: { questionId: true, timesPlayed: true, lastPlayedAt: true },
  });
  const usageByQuestion = new Map(usages.map((u) => [u.questionId, u]));

  const byCategory = new Map<string, { id: string; category: string }[]>();
  for (const q of questions) {
    const list = byCategory.get(q.category) ?? [];
    list.push(q);
    byCategory.set(q.category, list);
  }

  const eligible: { id: string; category: string }[] = [];
  for (const categoryQuestions of byCategory.values()) {
    const playedInCategory = categoryQuestions.filter((q) => usageByQuestion.has(q.id)).length;
    const exhausted = playedInCategory >= Math.ceil(0.8 * categoryQuestions.length);
    for (const q of categoryQuestions) {
      if (excludeSet.has(q.id)) continue;
      if (exhausted || !usageByQuestion.has(q.id)) eligible.push(q);
    }
  }

  let selected = tieredSelect(eligible, usageByQuestion, count);

  if (selected.length < count) {
    const selectedIds = new Set(selected.map((q) => q.id));
    const remaining = questions
      .filter((q) => !excludeSet.has(q.id) && !selectedIds.has(q.id))
      .sort((a, b) => {
        const aTime = usageByQuestion.get(a.id)?.lastPlayedAt.getTime() ?? 0;
        const bTime = usageByQuestion.get(b.id)?.lastPlayedAt.getTime() ?? 0;
        return aTime - bTime;
      });
    selected = [...selected, ...remaining.slice(0, count - selected.length)];
  }

  return selected.map((q) => ({ id: q.id }));
}

/**
 * Records that `questionIds` were drawn for `coupleId`: existing rows get
 * `timesPlayed++`, questions never played before get a fresh row.
 *
 * Two bulk statements rather than one upsert per question. The caller
 * (POST /api/games) runs this inside a Prisma interactive transaction while
 * creating a 15-question session, and an interactive transaction has a wall
 * clock (5s by default). Fifteen sequential upserts against a remote
 * Postgres — 15+ round-trips, each paying full network latency — blew that
 * budget and failed session creation with "Transaction not found. Transaction
 * ID is invalid, refers to an old closed transaction": a 500 on the very
 * first "Nouvelle partie" tap, reproducible against Neon. Two statements pay
 * that latency twice instead of fifteen times.
 *
 * Order matters and is not interchangeable: updateMany first bumps the rows
 * that already exist, then createMany({skipDuplicates}) inserts only the
 * ones that had none. Reversed, createMany would insert the missing rows and
 * updateMany would then immediately bump them to timesPlayed=2 on a first
 * play.
 */
export async function recordQuestionUsage(
  client: QueryClient,
  coupleId: string,
  questionIds: string[],
): Promise<void> {
  // Deduplicated so a repeated id counts as one play. The upsert loop this
  // replaced would have counted it twice (create, then increment); callers
  // pass distinct ids, so this only pins the ambiguous case rather than
  // changing any real behaviour.
  const ids = [...new Set(questionIds)];
  if (ids.length === 0) return;

  const lastPlayedAt = new Date();

  await client.questionUsage.updateMany({
    where: { coupleId, questionId: { in: ids } },
    data: { timesPlayed: { increment: 1 }, lastPlayedAt },
  });

  await client.questionUsage.createMany({
    data: ids.map((questionId) => ({ coupleId, questionId, timesPlayed: 1, lastPlayedAt })),
    skipDuplicates: true,
  });
}
