// The landing page's category grid, DERIVED from the shipped question bank
// rather than written out by hand.
//
// Why derived. The grid used to be a hand-written table advertising eight
// categories and 440 questions. The bank actually ships 27 questions across
// seven categories, six of the eight advertised names had no question at
// all, and five real categories were never advertised. Nothing connected
// the two, so the page drifted from the content the moment either changed —
// the same class of defect as the landing's placeholder CTAs and the
// pairing screen's "a game is coming soon" copy.
//
// `prisma/seed-data/questions.ts` is the source of truth for what ships:
// `scripts/seed-questions.ts` upserts exactly that array into the database
// by slug. Deriving from it means adding a question updates the landing
// page for free, and no count on that page can be wrong.
//
// Deliberately NOT read from the database at request time: that would tie
// a marketing page's availability to Prisma and add a query to every visit,
// to display numbers that only change when the seed file changes.
import { QUESTIONS_SEED } from '../../../prisma/seed-data/questions';
import { roundLabelForType } from '@/lib/game/round-labels';

/** One cell of the grid: a category, its round, and how many questions it holds. */
export interface CategoryRow {
  name: string;
  /** The raw round type, for keying and styling. */
  roundType: string;
  /** French round name ("Miroir"), or `null` for a round type with no label. */
  roundTitle: string | null;
  count: number;
}

export interface CategoryShowcase {
  rows: CategoryRow[];
  totalQuestions: number;
  categoryCount: number;
}

/** Play order, so the grid reads in the order a couple meets the rounds. */
const ROUND_ORDER: readonly string[] = ['MIROIR', 'SCENARIO', 'FACEAFACE'];

type SeedEntry = { roundType: string; category: string };

function roundRank(roundType: string): number {
  const index = ROUND_ORDER.indexOf(roundType);
  // An unrecognised round sorts last rather than first: it is an anomaly,
  // and burying it keeps the grid's normal reading order intact.
  return index === -1 ? ROUND_ORDER.length : index;
}

/**
 * Groups the question bank into grid rows.
 *
 * A category is scoped to its round — two rounds may legitimately use the
 * same category name for different questions, and merging them would
 * misreport both counts. Rows are ordered by round (play order), then by
 * size descending, then by name, so the grid is stable across builds
 * instead of inheriting the seed file's authoring order.
 */
export function buildCategoryShowcase(
  seed: readonly SeedEntry[] = QUESTIONS_SEED,
): CategoryShowcase {
  const counts = new Map<string, CategoryRow>();

  for (const entry of seed) {
    // JSON.stringify, not a delimiter: no separator character can be
    // ruled out of a category name, and a raw one would silently merge
    // two rows the day a name contained it.
    const key = JSON.stringify([entry.roundType, entry.category]);
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    counts.set(key, {
      name: entry.category,
      roundType: entry.roundType,
      roundTitle: roundLabelForType(entry.roundType)?.title ?? null,
      count: 1,
    });
  }

  const rows = [...counts.values()].sort(
    (a, b) =>
      roundRank(a.roundType) - roundRank(b.roundType) ||
      b.count - a.count ||
      a.name.localeCompare(b.name, 'fr'),
  );

  return {
    rows,
    totalQuestions: seed.length,
    categoryCount: rows.length,
  };
}
