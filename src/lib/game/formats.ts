// The three game lengths from the canvases (planche 04 mobile / 02 web):
// Express, Standard, Longue soirée.
//
// Pure and client-safe: the picker screen and the server draw both read
// these, and a second copy of the numbers on either side is how a screen
// starts promising fifteen questions while the engine deals ten.
//
// What a format changes is LENGTH, not shape. Every format still plays the
// three manches — Miroir, Scénarios, Face à face — because those are the
// game, not a feature of the long version. That is why the question count
// is distributed across three rounds rather than used to drop rounds.

export type GameFormatId = 'EXPRESS' | 'STANDARD' | 'LONGUE_SOIREE';

export interface GameFormat {
  id: GameFormatId;
  label: string;
  totalQuestions: number;
  /** Rough play time, as the canvas states it. Display only. */
  minutes: number;
  /** One line under the label on the picker. */
  blurb: string;
}

export const DEFAULT_FORMAT_ID: GameFormatId = 'STANDARD';

export const GAME_FORMATS: readonly GameFormat[] = [
  {
    id: 'EXPRESS',
    label: 'Express',
    totalQuestions: 5,
    minutes: 5,
    blurb: 'Un aperçu, quand vous avez peu de temps.',
  },
  {
    id: 'STANDARD',
    label: 'Standard',
    totalQuestions: 15,
    minutes: 12,
    blurb: 'Le format complet. C’est celui que nous conseillons.',
  },
  {
    id: 'LONGUE_SOIREE',
    label: 'Longue soirée',
    totalQuestions: 30,
    minutes: 25,
    blurb: 'Pour aller plus loin, sans vous presser.',
  },
] as const;

/**
 * Looks a format up by id, failing CLOSED.
 *
 * An unknown id returns null rather than silently falling back to the
 * default: a stored value nobody recognises means the session was written
 * by code that no longer matches this one, and quietly dealing a
 * fifteen-question game to a couple who paid for thirty is worse than an
 * error somebody notices.
 */
export function formatById(id: string | null | undefined): GameFormat | null {
  return GAME_FORMATS.find((f) => f.id === id) ?? null;
}

/**
 * How a format's questions split across the three manches.
 *
 * Front-loaded when the total does not divide evenly — Express is five
 * questions over three rounds, which is 2 / 2 / 1. The alternative was to
 * drop a manche, and a "quick game" that never reaches Face à face is a
 * different game rather than a shorter one.
 *
 * A round of zero is never produced: `rounds` is capped at `total` so a
 * format shorter than the round count yields fewer, non-empty rounds
 * instead of empty ones the state machine could not advance through.
 */
export function questionsPerRound(total: number, rounds = 3): number[] {
  if (!Number.isFinite(total) || total < 1 || !Number.isFinite(rounds) || rounds < 1) return [];
  const n = Math.floor(total);
  const r = Math.min(Math.floor(rounds), n);
  const base = Math.floor(n / r);
  const remainder = n % r;
  return Array.from({ length: r }, (_, i) => base + (i < remainder ? 1 : 0));
}
