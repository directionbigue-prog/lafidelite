// Who should be holding the phone right now (Lot 2, Task 19).
//
// Pass-and-play means ONE authenticated account per device: `viewerRole`
// (from GET /api/couples/me) says which side of the couple that account
// is, and `activePlayerRole` (from GET /api/games/current) says whose turn
// the server thinks it is. Comparing them is the whole decision — but it
// is a comparison that is easy to invert by accident and impossible to
// notice visually while testing alone on one phone, so it lives here as a
// pure function with both directions pinned by tests.
//
// Note this is a DISPLAY decision, never an authorization one: the server
// records the answer for the active role regardless of who physically
// holds the device (see the plan's pass-and-play design note). Getting
// this wrong shows the wrong prompt; it cannot let anyone answer as
// someone they aren't.

export type PlayerRole = 'CREATOR' | 'PARTNER';

export type PassDeviceTarget =
  | { kind: 'self' }
  | { kind: 'partner'; partnerName: string | null }
  | { kind: 'unknown' };

/**
 * Decide what the pass-the-device screen should announce.
 *
 * Returns `'unknown'` when either role is missing or unrecognized rather
 * than defaulting to one of them — announcing the wrong person would send
 * the phone to the wrong hands, which is worse than saying so plainly.
 */
export function passDeviceTarget(
  activePlayerRole: string,
  viewerRole: string,
  partnerName: string | null,
): PassDeviceTarget {
  if (!isPlayerRole(activePlayerRole) || !isPlayerRole(viewerRole)) return { kind: 'unknown' };
  if (activePlayerRole === viewerRole) return { kind: 'self' };
  return { kind: 'partner', partnerName };
}

function isPlayerRole(value: string): value is PlayerRole {
  return value === 'CREATOR' || value === 'PARTNER';
}

/** Fallback used when the partner has no name recorded on their account. */
export const PARTNER_FALLBACK_NAME = 'votre partenaire';

/** The heading for a `PassDeviceTarget`, ready to render. */
export function passDeviceHeading(target: PassDeviceTarget): string {
  switch (target.kind) {
    case 'self':
      return 'À toi de jouer';
    case 'partner':
      return `Passe le téléphone à ${target.partnerName ?? PARTNER_FALLBACK_NAME}`;
    case 'unknown':
      return 'Impossible de savoir à qui est le tour';
  }
}

/**
 * The single letter shown in the tile above the heading — the canvas's
 * stand-in for a face, since this product has no avatars.
 *
 * Returns `null` rather than a placeholder glyph when there is no name to
 * take it from: an empty tile is honest, a "?" reads as an error, and a
 * hardcoded initial would name the wrong person. Callers hide the tile.
 */
export function passDeviceInitial(target: PassDeviceTarget, ownName: string | null): string | null {
  const name =
    target.kind === 'partner' ? target.partnerName : target.kind === 'self' ? ownName : null;
  const first = name?.trim().charAt(0) ?? '';
  return first === '' ? null : first.toUpperCase();
}

/**
 * The button that hands the turn over. Naming the person in the label is
 * the canvas's idea and a good one: the button is the last chance to catch
 * the wrong pair of hands, and "C'est moi, Malick" is refusable in a way
 * that a bare "Continuer" is not.
 */
export function passDeviceCtaLabel(target: PassDeviceTarget): string {
  if (target.kind === 'self') return 'C’est à moi';
  if (
    target.kind === 'partner' &&
    target.partnerName !== null &&
    target.partnerName.trim() !== ''
  ) {
    return `C’est moi, ${target.partnerName.trim()}`;
  }
  return 'C’est moi';
}
