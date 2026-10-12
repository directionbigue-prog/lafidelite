// Blank-safe environment readers.
//
// `Number(process.env.X ?? 10)` looks like "10 unless configured" but is
// not: `??` falls back only on `undefined`, so a variable DECLARED WITH NO
// VALUE — `AUTH_PASSWORD_MIN_LENGTH=` on its own line — reaches Number()
// as `''`, and `Number('')` is **0**. The setting silently becomes zero
// instead of its default:
//
//   AUTH_PASSWORD_MIN_LENGTH=   -> minimum length 0, every password accepted
//   AUTH_VERIFICATION_TTL_MIN=  -> codes expire the instant they are issued
//   EMAIL_JOB_RETENTION_DAYS=   -> the purge cron deletes everything
//   AUTH_LOCKOUT_THRESHOLD=     -> lockout after zero failed attempts
//
// This is not hypothetical in this repo: its own .env.local ships
// `SMOKE_BASE_URL=` with no value, which is exactly how both smoke scripts
// came to build requests against an empty base URL. Wherever one blank
// line can appear, others can.
//
// `envInt` treats blank-or-unparsable as absent and returns the fallback,
// so the only way to get a surprising number is to write one deliberately.
import 'server-only';

/**
 * An integer setting, or `fallback` when the variable is missing, blank, or
 * not a finite number.
 *
 * Note what is NOT clamped: a deliberately configured `0` is honoured. The
 * bug being fixed is a blank value silently BECOMING zero, not zero itself
 * being invalid — some of these settings legitimately accept it.
 */
export function envInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (trimmed === '') return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * A string setting, or `fallback` when the variable is missing or blank.
 *
 * Use for values where an empty string is meaningless — a base URL, a
 * cookie prefix. NOT for the `?? ''` sentinels (CRON_SECRET, API keys)
 * where blank deliberately means "not configured" and the caller checks
 * for it.
 */
export function envStr(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim();
  return trimmed === undefined || trimmed === '' ? fallback : trimmed;
}
