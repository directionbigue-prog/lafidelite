// The dashboard eyebrow: "Bonsoir tous les deux".
//
// The canvas shows the evening form, because that is when a couple sits
// down to play. Shipping it as a constant would greet someone with
// "Bonsoir" at nine in the morning — a small wrongness, but the kind a
// user notices immediately and never stops noticing.
//
// Pure and hour-based rather than reading the clock itself, so it is
// testable in Node (this repo ships no jsdom) and so the caller decides
// WHEN "now" is.

/** Boundaries in local hours: night < 5 ≤ morning < 18 ≤ evening. */
const MORNING_STARTS = 5;
const EVENING_STARTS = 18;

export function greetingForHour(hour: number): string {
  // An out-of-range or non-finite hour falls back to the neutral daytime
  // form rather than throwing: a broken clock must not blank the page.
  if (!Number.isFinite(hour)) return 'Bonjour';
  const h = Math.floor(hour);
  if (h < MORNING_STARTS || h >= EVENING_STARTS) return 'Bonsoir';
  return 'Bonjour';
}

/**
 * The full eyebrow line. Kept beside the greeting so the two never drift
 * into different registers — the rest of the signed-in product says
 * "vous", and so does this.
 */
export function dashboardGreeting(hour: number): string {
  return `${greetingForHour(hour)} tous les deux`;
}
