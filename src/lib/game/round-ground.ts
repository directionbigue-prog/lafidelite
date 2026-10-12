// Which ground a round is played on, and the chrome that goes with it.
//
// The mobile canvas draws the Scénarios round on cream (#F6EEE6, text
// #241129) where Miroir runs on ink. That is not decoration: the three
// rounds are three chapters, and the canvas makes the middle one FELT
// rather than announced. Screen 05 (Miroir) and screen 06 (Scénarios) are
// otherwise the same screen, so the only honest way to read the canvas is
// that the ground follows the round.
//
// Everything the two grounds disagree about is enumerated here, in one
// object per ground, for a reason learned the hard way in this codebase:
// when a variant is expressed as scattered ternaries at each call site,
// the two halves drift, and drift on a light ground means unreadable text
// rather than a slightly-off shade. One place to look, one place to fix.
//
// Pure and unit-tested — Vitest runs on `environment: 'node'` here with no
// jsdom, so class decisions live in a module rather than inside a
// component where nothing can reach them.

export type Ground = 'dark' | 'light';

export interface GroundChrome {
  /** Passed straight to `FocusLayout`'s `ground` prop. */
  layout: 'ink' | 'cream';
  /** The round's name above the question. */
  eyebrow: string;
  /** Position counters, hints, the closing reassurance line. */
  muted: string;
  /** A question already answered, or the one on screen. */
  segmentFilled: string;
  /** A question still ahead. */
  segmentEmpty: string;
  /** An option the player has not picked. */
  option: string;
  /** The picked option, and the tick beside it. */
  optionSelected: string;
  check: string;
  /** A raised panel on this ground — the "your answer" recap strip. */
  panel: string;
  /** The primary-action variant that reads on this ground. */
  ctaVariant: 'primary' | 'inverse';
  /**
   * The secondary-action variant for this ground.
   *
   * A declared variant rather than extra classes appended to the dark one:
   * Tailwind resolves conflicting utilities by their order in the
   * generated stylesheet, NOT by their order in the class attribute, so
   * "`border-cream/26` then `border-plum-deep/26`" is a coin toss that
   * would look right until a rebuild reordered the sheet.
   */
  secondaryVariant: 'secondary' | 'secondary-inverse';
  /** The countdown's outer disc. */
  timerShell: string;
  /** The number inside it. */
  timerNumber: string;
  /** The sweep, as a raw colour: it feeds a runtime conic-gradient, not a class. */
  timerRing: string;
}

const DARK: GroundChrome = {
  layout: 'ink',
  eyebrow: 'text-gold',
  muted: 'text-cream/70',
  segmentFilled: 'bg-gold',
  segmentEmpty: 'bg-cream/18',
  option: 'border-cream/16 bg-plum-card2 text-cream/90 hover:border-gold/60',
  optionSelected: 'border-gold bg-gold/12 text-cream',
  check: 'text-gold',
  panel: 'bg-plum-card2 text-cream/70',
  ctaVariant: 'primary',
  secondaryVariant: 'secondary',
  timerShell: 'border-gold/40 bg-plum-card2',
  timerNumber: 'bg-cream text-ink',
  timerRing: '#8B2C56',
};

const LIGHT: GroundChrome = {
  layout: 'cream',
  eyebrow: 'text-wine',
  muted: 'text-plum-deep/70',
  segmentFilled: 'bg-wine',
  segmentEmpty: 'bg-plum-deep/16',
  option: 'border-plum-deep/16 bg-white text-plum-deep hover:border-wine/60',
  optionSelected: 'border-wine bg-wine/10 text-plum-deep',
  check: 'text-wine',
  panel: 'bg-white text-plum-deep/70',
  ctaVariant: 'inverse',
  secondaryVariant: 'secondary-inverse',
  // Left dark, the countdown was a black blob on a cream page — the one
  // element loud enough to pull the eye off the question.
  timerShell: 'border-wine/40 bg-white',
  timerNumber: 'bg-wine text-cream',
  timerRing: '#E8B860',
};

const CHROME: Record<Ground, GroundChrome> = { dark: DARK, light: LIGHT };

/**
 * The ground a round type is played on.
 *
 * Anything unrecognised gets `dark`, and that default is deliberate rather
 * than lazy: dark is the app's ground everywhere else, so an unknown round
 * type renders as the rest of the product instead of as a screen that
 * looks broken. This is a presentation decision with no security or
 * correctness weight — unlike `roundLabel` or `routeForPhase`, which
 * return `null` on an unknown value because guessing there would mislead.
 */
export function groundForRound(roundType: string): Ground {
  return roundType === 'SCENARIO' ? 'light' : 'dark';
}

/** The chrome for a ground. */
export function groundChrome(ground: Ground): GroundChrome {
  return CHROME[ground];
}

/** Shorthand for the common `groundChrome(groundForRound(type))`. */
export function chromeForRound(roundType: string): GroundChrome {
  return groundChrome(groundForRound(roundType));
}
