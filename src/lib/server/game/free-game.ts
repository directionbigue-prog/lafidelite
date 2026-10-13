// Who still has a free game, and who is exempt from the rule entirely.
//
// The product rule (revised 2026-10-13): a COUPLE gets ONE free game. The
// claim is still written on the account that launches it
// (`User.freeGameUsedAt`), but a partner whose other half has already spent
// theirs is refused too — see `partieOfferteDejaJouee`. Before, each partner
// had one, so a couple started with two; with the invitee now joining from
// the link with a fresh account in one click, that second game came for free
// to every couple. Beyond the free game, the couple needs a paid pack.
//
// The exemption exists so the seeded demo accounts stay playable while
// there is no way to pay. It is deliberately env-driven and empty by
// default: shipping to production without setting the variable leaves
// NOBODY exempt, which is the safe direction to fail. Remove the variable
// (not the code) to turn the exemption off anywhere.
//
// Pure and unit-tested, like every other decision in this codebase that a
// route would otherwise bury: an exemption list that silently matches
// everyone — or nobody — is invisible until someone is billed wrongly.

/**
 * The env variable holding the exempt addresses, comma-separated.
 *
 * Named after what it does rather than after the seed script, because the
 * exemption is not "the test couple" — it is "these addresses", whoever
 * they turn out to be.
 */
export const FREE_GAME_EXEMPT_ENV = 'FREE_GAME_EXEMPT_EMAILS';

/**
 * Has the couple already played its one free game? True as soon as EITHER
 * partner's account carries a claim — whoever held the phone that time.
 */
export function partieOfferteDejaJouee(...usages: readonly (Date | null | undefined)[]): boolean {
  return usages.some((u) => u instanceof Date);
}

/**
 * Is this address exempt from the free-game limit?
 *
 * Matching is case-insensitive and whitespace-tolerant, because the value
 * is typed by a human into a `.env` file. Everything else fails CLOSED:
 * a missing variable, an empty one, a list of only separators, or a caller
 * with no email at all is NOT exempt.
 *
 * Note this does not accept a wildcard, on purpose. `FREE_GAME_EXEMPT_EMAILS=*`
 * disabling the rule for everyone is exactly the kind of switch that gets
 * left on in production; an explicit list cannot be flipped by accident.
 */
export function isFreeGameExempt(email: string | null | undefined, rawList: string | undefined) {
  const normalised = email?.trim().toLowerCase();
  if (!normalised) return false;

  return (rawList ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '')
    .includes(normalised);
}
