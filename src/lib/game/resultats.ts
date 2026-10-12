// Pure decision logic for `/jeu/[id]/resultats` (Lot 2, Task 22) — the
// final screen a couple sees once a game reaches `COMPLETE`.
//
// Same rationale as `phase-routes.ts`, `start-screen.ts`, `question-screen.ts`
// and `round-reveal.ts`: this repo runs Vitest with `environment: 'node'` and
// ships neither jsdom nor Testing Library (project-owner decision), so every
// decision the page makes lives here as an exported pure function covered by
// exact-value unit tests, and the page component stays a thin fetch + render
// wrapper that maps over `buildResultsSections`'s output in order.
//
// Product constraint this module exists to make structurally impossible to
// violate (see the design brief and CLAUDE.md's couple-pairing spec): the
// screen never produces a "winner" and a "loser". Concretely:
//   - `coupleScore` must render BEFORE the individual scores/titles — DOM
//     order is a product requirement, not styling. `buildResultsSections`
//     returns a FIXED-ORDER array (`coupleScore` -> `complicityLevel` ->
//     `individualScores` -> `titles` -> `conversationPrompts`); the page
//     component renders it via a single `.map()`, so the order the test
//     pins on this array IS the DOM order — there is no second place the
//     order could silently diverge.
//   - When the server masks the gap (`gapMasked: true`, i.e. a `GameResults`
//     response with `maskedMessage` instead of the three numeric fields),
//     `buildResultsSections` MUST NOT compute, infer, or carry forward any
//     numeric stand-in. `isMaskedResults` narrows on KEY PRESENCE
//     (`'maskedMessage' in data`), never on a value being falsy/undefined —
//     a response that had a numeric field present-but-`undefined` must still
//     be treated as unmasked-with-a-bug, not silently accepted as masked.
//     See `resultats.test.ts` for the fixture that pins this: an
//     `individualScores` section for a masked result carries ONLY `message`,
//     never `creatorScore`/`partnerScore`, checked by key-presence
//     (`'creatorScore' in section`), not `toBeUndefined()` — the latter
//     would pass even if a numeric field leaked back in as `undefined`.
//
// `complicityLevelLabel` exists because `complicityLevel` is a raw backend
// enum (`DECOUVERTE` | `COMPLICES` | `FUSIONNELS` | `INSEPARABLES` — see
// `src/lib/server/game/scoring.ts`) that must never reach the
// screen untranslated.
import { revealColumnLabels, type RevealColumnLabels } from './round-reveal';

export type { RevealColumnLabels as ResultsColumnLabels };
export { revealColumnLabels as resultsColumnLabels };

/** French display text for each raw `complicityLevel` enum value. */
const COMPLICITY_LEVEL_LABELS: Record<string, string> = {
  DECOUVERTE: 'Découverte',
  COMPLICES: 'Complices',
  FUSIONNELS: 'Fusionnels',
  INSEPARABLES: 'Inséparables',
};

/**
 * Translates a raw `complicityLevel` enum value into French display text.
 * An unrecognized value (a future backend level this build predates) falls
 * back to the raw string rather than a guessed label — this is a display-
 * only fallback, not a phase gate, so it does not need to block the screen
 * the way `routeForPhase`'s `null` does; it only needs to never be silently
 * wrong.
 */
export function complicityLevelLabel(level: string): string {
  return COMPLICITY_LEVEL_LABELS[level] ?? level;
}

/** Fields present on every `GET /api/games/:id/results` response. */
export interface GameResultsBase {
  coupleScore: number;
  complicityLevel: string;
  creatorTitle: string;
  partnerTitle: string;
  winnerRole: string;
  conversationPrompts: string[];
}

/** Response shape when `gapMasked` is `false` on the server. */
export interface GameResultsUnmasked extends GameResultsBase {
  creatorTotalScore: number;
  partnerTotalScore: number;
  gapPercent: number;
}

/**
 * Response shape when `gapMasked` is `true` on the server — the route OMITS
 * `creatorTotalScore` / `partnerTotalScore` / `gapPercent` from the JSON
 * entirely (see `route.ts`'s doc comment: "not null, not zero"), so this
 * type carries no numeric fields at all, only `maskedMessage`.
 */
export interface GameResultsMasked extends GameResultsBase {
  maskedMessage: string;
}

export type GameResultsResponse = GameResultsUnmasked | GameResultsMasked;

/**
 * True when a `GameResultsResponse` is the masked variant. Narrows on KEY
 * PRESENCE, never on truthiness — see this module's header comment for why
 * that distinction is load-bearing.
 */
export function isMaskedResults(data: GameResultsResponse): data is GameResultsMasked {
  return 'maskedMessage' in data;
}

export interface CoupleScoreSection {
  kind: 'coupleScore';
  coupleScore: number;
}

export interface ComplicityLevelSection {
  kind: 'complicityLevel';
  label: string;
}

export type IndividualScoresSection =
  | { kind: 'individualScores'; masked: true; message: string }
  | {
      kind: 'individualScores';
      masked: false;
      creatorLabel: string;
      creatorScore: number;
      partnerLabel: string;
      partnerScore: number;
    };

export interface TitlesSection {
  kind: 'titles';
  creatorLabel: string;
  creatorTitle: string;
  partnerLabel: string;
  partnerTitle: string;
}

export interface ConversationPromptsSection {
  kind: 'conversationPrompts';
  prompts: string[];
}

export type ResultsSection =
  | CoupleScoreSection
  | ComplicityLevelSection
  | IndividualScoresSection
  | TitlesSection
  | ConversationPromptsSection;

/**
 * The single source of truth for both WHAT this screen shows and in WHICH
 * ORDER. The page component renders exactly `.map()` over this array — see
 * this module's header comment for why that's what makes the DOM-order
 * product requirement genuinely testable without jsdom.
 *
 * `columnLabels` should come from `resultsColumnLabels` (a re-export of
 * `round-reveal.ts`'s `revealColumnLabels`) applied to the viewer's
 * `viewerRole` / `partnerName` from `GET /api/couples/me`, exactly as
 * `manche-revelee/page.tsx` does for its own two columns — reused rather
 * than reimplemented because the "Toi" vs. partner-name labelling rule is
 * identical for both screens.
 */
/**
 * `conversationPrompts` is stored as a Prisma `Json` column and typed
 * `unknown` at the route boundary, so by the time it reaches this screen
 * nothing has proved it is an array of strings. The page renders it with
 * `.map()` OUTSIDE any try/catch, so a malformed value (an object from a
 * hand-edited row, an older shape) would throw straight past the screen
 * into the global error boundary — losing the whole results page over its
 * last section.
 *
 * Degrading to an empty list keeps the couple's score, level and titles
 * on screen. Non-string entries are dropped rather than coerced: a
 * stringified `[object Object]` prompt would be worse than a missing one.
 */
function toPromptList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function buildResultsSections(
  data: GameResultsResponse,
  columnLabels: RevealColumnLabels,
): ResultsSection[] {
  const individualScores: IndividualScoresSection = isMaskedResults(data)
    ? { kind: 'individualScores', masked: true, message: data.maskedMessage }
    : {
        kind: 'individualScores',
        masked: false,
        creatorLabel: columnLabels.creatorLabel,
        creatorScore: data.creatorTotalScore,
        partnerLabel: columnLabels.partnerLabel,
        partnerScore: data.partnerTotalScore,
      };

  return [
    { kind: 'coupleScore', coupleScore: data.coupleScore },
    { kind: 'complicityLevel', label: complicityLevelLabel(data.complicityLevel) },
    individualScores,
    {
      kind: 'titles',
      creatorLabel: columnLabels.creatorLabel,
      creatorTitle: data.creatorTitle,
      partnerLabel: columnLabels.partnerLabel,
      partnerTitle: data.partnerTitle,
    },
    { kind: 'conversationPrompts', prompts: toPromptList(data.conversationPrompts) },
  ];
}
