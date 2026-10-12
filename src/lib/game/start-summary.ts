// What the game's start screen says about a couple before they play.
//
// Pure, so it is tested in Node — the repo ships no jsdom, so anything left
// inside the component is untestable. The component renders what this
// returns and decides nothing.

import { TOTAL_ROUNDS } from '@/lib/game/round-labels';

/*
 * There used to be a `QUESTIONS_PER_GAME = QUESTIONS_PER_ROUND * TOTAL_ROUNDS`
 * here, and the start screen promised "15 questions" with it. That promise
 * stopped being true the day the three formats shipped: the couple picks
 * 5, 15 or 30 on the very next screen, so the number cannot be known here
 * at all. The screen now says the one thing that is true of every format —
 * three rounds — and leaves the length to the screen that asks for it.
 */

export interface StandingSummary {
  /** French level name, or `null` before the couple has ever scored. */
  levelLabel: string | null;
  score: number;
  /** One line under the level: what it means, or what happens next. */
  caption: string;
  /** True before the first completed game, so the card can invite rather than report. */
  isFirstGame: boolean;
}

/**
 * The standing card's content.
 *
 * A couple who has never finished a game has a cumulative score of 0, and
 * reporting "Découverte · 0" to them reads as a verdict on a game they have
 * not played yet. That case gets an invitation instead — the one moment
 * where showing the number would be actively discouraging.
 */
export function standingSummary(
  complicityLevel: string | null,
  score: number,
  labelFor: (level: string) => string,
): StandingSummary {
  // Guard on the SCORE, not on the level: the server always sends a level,
  // and `DECOUVERTE` is equally what a couple sits at after several close
  // games. Only a zero total means "nothing played yet".
  if (score <= 0) {
    return {
      levelLabel: null,
      score: 0,
      caption: `Votre première partie : ${TOTAL_ROUNDS} manches, et c'est vous qui choisissez la longueur.`,
      isFirstGame: true,
    };
  }

  return {
    levelLabel: complicityLevel === null ? null : labelFor(complicityLevel),
    score,
    caption: 'Votre score se cumule d’une partie à l’autre. Jamais l’un contre l’autre.',
    isFirstGame: false,
  };
}

export interface RoundPreview {
  num: string;
  title: string;
  rule: string;
}

/**
 * The three rounds, in play order, for the "what's coming" card.
 *
 * Built from `roundLabel` rather than a local list so the names and rules
 * can never disagree with what the interstitial screens announce mid-game.
 */
export function roundPreviews(labelFor: (n: number) => { title: string; rule: string } | null) {
  const rounds: RoundPreview[] = [];
  for (let n = 1; n <= TOTAL_ROUNDS; n += 1) {
    const label = labelFor(n);
    // A round with no label is a real inconsistency, not something to
    // paper over with a placeholder — skip it and let the card be short
    // rather than invent a name for a round the game cannot announce.
    if (label) {
      rounds.push({ num: String(n).padStart(2, '0'), title: label.title, rule: label.rule });
    }
  }
  return rounds;
}
