// Cleaning what a human actually types into an 8-character code field
// (/verify-email, /reinitialiser-mot-de-passe).
//
// Pure and framework-free so it is unit-tested in Node: this repo ships no
// jsdom or Testing Library, so logic that only exists inside a component
// cannot be covered. The components render what this returns.
//
// Why this module exists. The server's shape check is a zod regex over
// `[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}` (VERIFICATION_CODE_REGEX in
// lib/server/auth.ts), and anything else is answered `VALIDATION_FAILED` —
// which the client maps to "Le formulaire contient une erreur." Both screens
// only called `.toUpperCase()` and leaned on `maxLength={8}`, which is a
// coincidence rather than a defence: truncating at 8 happens to cut away a
// TRAILING space or full stop, so those cases worked by accident. Measured
// against the running server, what actually came back 400 was:
//
//   · a leading space — very common in a copy out of a mail client;
//   · a grouping space or dash inside the code (`ABCD 2345`), where the
//     truncation then ATE the last character, so even retyping the code
//     correctly could not recover;
//   · a misread confusable glyph (O for Q, 1 for 7…), answered with that
//     same dead-end sentence and no hint that a code never contains one.
//
// Each attempt also burns one of five per fifteen minutes
// (AUTH_VERIFY_RATE_LIMIT_MAX), so a user pasting four times is locked out
// by the field rather than by anything they did. That is why the shape is
// checked here, before the request.
//
// The alphabet is NOT a source of truth — the server's is. It is restated
// here because the browser cannot read it, and drift is caught by
// verification-code.test.ts, which asserts the two agree.

/**
 * The code alphabet, mirroring VERIFICATION_CODE_ALPHABET in
 * lib/server/auth.ts. Confusable glyphs are absent on purpose: no I, no L,
 * no O, no 0, no 1.
 */
export const VERIFICATION_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Mirrors VERIFICATION_CODE_LENGTH in lib/server/auth.ts. */
export const VERIFICATION_CODE_LENGTH = 8;

/**
 * Glyphs a person types when they misread one of the real ones. They are
 * dropped like any other stray character, but they are worth naming in a
 * hint: unlike a space, their presence means the code itself was misread,
 * and no substitution is safe to guess (an `O` could have been a Q, a D or
 * a G). Uppercased first, so `o`, `l` and `i` land here too.
 */
const CONFUSABLES = new Set(['0', 'O', '1', 'I', 'L']);

export interface VerificationCodeEntry {
  /** What to put back in the field: uppercase, alphabet-only, ≤ 8 chars. */
  code: string;
  /** The input held O, I, L, 0 or 1 — a misreading, not formatting noise. */
  hadConfusable: boolean;
}

/**
 * Clean one field value. Strips everything outside the alphabet (spaces,
 * dashes, punctuation, invisible paste residue) and caps at 8 characters.
 *
 * Capping rather than refusing is what makes a grouped paste work: the old
 * `maxLength={8}` truncated `ABCD EFGH` to `ABCD EFG` in the browser, before
 * any code here could see it, which is why the attribute must now be loose
 * and the cap live in this function.
 */
export function cleanVerificationCode(raw: string): VerificationCodeEntry {
  const upper = raw.toUpperCase();
  let code = '';
  let hadConfusable = false;
  for (const ch of upper) {
    if (VERIFICATION_CODE_ALPHABET.includes(ch)) {
      if (code.length < VERIFICATION_CODE_LENGTH) code += ch;
      continue;
    }
    if (CONFUSABLES.has(ch)) hadConfusable = true;
  }
  return { code, hadConfusable };
}

/**
 * The hint shown under the field while typing, or null for nothing to say.
 * A hint, not an error: the character is already gone from the field, and
 * the point is to explain why it vanished.
 */
export function verificationCodeHint(entry: VerificationCodeEntry): string | null {
  if (!entry.hadConfusable) return null;
  return 'Un code ne contient jamais O, I, L, 0 ni 1 — relisez le caractère concerné.';
}

/**
 * The error that blocks submission, or null when the value is shaped like a
 * code. Checked BEFORE the request on purpose: a malformed code would come
 * back `VALIDATION_FAILED` and cost one of the five attempts allowed per
 * quarter-hour, so the field must never spend one on a value the server is
 * certain to refuse.
 *
 * An empty field returns null — `required` on the input already covers it,
 * and telling someone their count is wrong before they have typed is noise.
 */
export function verificationCodeError(code: string): string | null {
  if (code.length === 0) return null;
  const missing = VERIFICATION_CODE_LENGTH - code.length;
  // `missing < 0` cannot come from cleanVerificationCode, which caps the
  // length — but a caller passing a raw value must not be answered "il en
  // manque -2".
  if (missing > 0) {
    return `Le code compte ${VERIFICATION_CODE_LENGTH} caractères — il en manque ${missing}.`;
  }
  if (missing < 0) {
    return `Le code compte ${VERIFICATION_CODE_LENGTH} caractères, pas plus.`;
  }
  return null;
}
