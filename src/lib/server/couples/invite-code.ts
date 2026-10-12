// Invite code for the "Espace Couple" pairing flow (PRD §9 R1 — "code à 6
// chiffres"). Deliberately numeric-only and short: it's meant to be
// readable off a phone screen and typed by hand as a fallback to the
// invite link, not to carry cryptographic entropy on its own — the DB
// unique constraint plus a 7-day TTL is the actual security boundary.
import 'server-only';
import crypto from 'node:crypto';

export const INVITE_CODE_REGEX = /^\d{6}$/;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function generateInviteCode(): string {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, '0');
}
