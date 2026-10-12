// Password strength for the signup form's meter (design canvas, planche
// "États & messages" — four segments plus a label).
//
// Pure and framework-free so it is unit-tested in Node: this repo ships no
// jsdom or Testing Library, so anything that only exists inside a component
// cannot be covered. The component renders what this returns.
//
// Deliberately NOT an authority on anything. The server decides what it
// accepts (AUTH_PASSWORD_MIN_LENGTH, a banned-password list, and a
// Have-I-Been-Pwned check answering PASSWORD_BANNED / PASSWORD_TOO_SHORT /
// PASSWORD_PWNED). This is a hint that helps someone choose a better
// password before submitting; a "Solide" score here is not a promise the
// server will accept it, and a weak one never blocks submission.

/** Mirrors the signup form's `minLength` and the server's default. */
export const PASSWORD_MIN_LENGTH = 10;

export type StrengthLevel = 'empty' | 'faible' | 'moyen' | 'bon' | 'solide';

export interface PasswordStrength {
  level: StrengthLevel;
  /** Filled segments out of `STRENGTH_SEGMENTS`, for the meter. */
  score: number;
  /** French label under the meter; `null` while the field is empty. */
  label: string | null;
}

export const STRENGTH_SEGMENTS = 4;

const LABELS: Record<Exclude<StrengthLevel, 'empty'>, string> = {
  faible: 'Faible',
  moyen: 'Moyen',
  bon: 'Bon',
  solide: 'Solide',
};

/**
 * Scores a password out of four.
 *
 * One point each for: reaching the minimum length, mixing letter cases,
 * containing a digit, and containing a symbol — then length beyond 14 lifts
 * a password that is long but plain, since length is what actually resists
 * an offline attack.
 *
 * A password below the minimum length is capped at one segment however
 * varied it is: the server will reject it outright, so showing "Bon" for
 * something that cannot be submitted would be a lie.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length === 0) return { level: 'empty', score: 0, label: null };

  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (password.length >= 14 && score < STRENGTH_SEGMENTS) score += 1;

  if (password.length < PASSWORD_MIN_LENGTH) score = Math.min(score, 1);

  const level: Exclude<StrengthLevel, 'empty'> =
    score <= 1 ? 'faible' : score === 2 ? 'moyen' : score === 3 ? 'bon' : 'solide';

  return { level, score: Math.max(score, 1), label: LABELS[level] };
}
