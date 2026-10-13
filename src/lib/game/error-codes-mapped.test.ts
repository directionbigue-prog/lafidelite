// Tripwire: every stable error code a game route can emit must have a
// French translation.
//
// Why this exists. The final whole-branch review found that
// `GAME_SESSION_NOT_FOUND` and `ROUND_NOT_AVAILABLE` — both emitted by
// `GET /api/games/:id/rounds/:roundNumber` — had no entry in
// `COUPLES_ERROR_MESSAGES`. `coupleErrorMessage` falls back to the raw
// backend message for an unmapped code, so a French-speaking player was
// shown "This round has no results to show yet." on the reveal screen:
// exactly the defect `lib/game/api-result.ts` was written to prevent.
//
// The cause was ordering, not carelessness — the translation table was
// written before the route that needed those codes existed, and nothing
// connected the two. A per-file review cannot catch that: each file is
// individually correct. So the connection is asserted here instead, and
// the next route added to the family fails this test until its codes are
// translated.
//
// Deliberately NOT asserted: that every mapped code is still emitted by
// some route. A stale entry is harmless, and pruning them would fight the
// codes that come from shared middleware rather than a route body.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COUPLES_ERROR_MESSAGES } from '@/lib/couples-error-messages';

const APP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');

/**
 * Route families whose errors surface on a screen a player reads.
 *
 * `api/auth` was added after the same defect resurfaced there: the sign-in,
 * verification and password-reset screens all render through
 * `coupleErrorMessage`, but four codes those routes emit
 * (TOO_MANY_FORGOT_ATTEMPTS, TOO_MANY_RESEND_ATTEMPTS,
 * RATE_LIMIT_UNAVAILABLE, EMAIL_ALREADY_VERIFIED) had no French entry, so a
 * rate-limited password reset answered a French user in English. Watching
 * only the two game families let that happen; the fix is to watch every
 * family whose errors reach a screen, not to translate one more code.
 */
const WATCHED = [
  path.join(APP_DIR, 'api', 'games'),
  path.join(APP_DIR, 'api', 'couples'),
  path.join(APP_DIR, 'api', 'auth'),
  path.join(APP_DIR, 'api', 'invites'),
  path.join(APP_DIR, 'api', 'rituel'),
  // Since 2026-10-13 the pack purchase button reads these on /tarifs.
  path.join(APP_DIR, 'api', 'orders'),
];

/**
 * Route files inside a watched family that no screen in THIS product reads.
 * `withdrawal-pin` belongs to the starter's payouts surface, which Cœur
 * Fidèle ships no UI for; its PIN codes are documented in CLAUDE.md and
 * would need translating the day a fork adds that screen.
 */
const NOT_IN_THIS_PRODUCT = [path.join('api', 'auth', 'withdrawal-pin')];

/**
 * Codes that are deliberately not translated.
 *
 * UNAUTHORIZED / FORBIDDEN / INTERNAL_ERROR come from shared middleware and
 * never reach a screen on their own — an expired session redirects to
 * /connexion. INVALID_REFRESH and CONFLICT are the token-refresh
 * machinery's own vocabulary: `lib/api.ts` consumes them to decide whether
 * to retry or sign the user out, and no component renders them.
 */
const NOT_PLAYER_FACING = new Set([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'INTERNAL_ERROR',
  'INVALID_REFRESH',
  'CONFLICT',
]);

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}

/**
 * Every stable error code a route handler's source can emit.
 *
 * Two spellings, because routes emit codes two ways and watching only the
 * first left a blind spot exactly where users land most often: a handler
 * writes `error: 'CODE'` in its own JSON, but a rate limiter declares its
 * code as `code: 'TOO_MANY_…'` in the config passed to `createEmailLimiter`
 * and emits it from shared code. Scanning only `error:` therefore reported
 * the auth family as fully translated while every "too many attempts"
 * response answered a French user in English.
 */
function emittedCodes(source: string): string[] {
  const codes: string[] = [];
  const pattern = /\b(?:error|code):\s*'([A-Z][A-Z0-9_]*)'/g;
  let match = pattern.exec(source);
  while (match !== null) {
    const code = match[1];
    if (code !== undefined) codes.push(code);
    match = pattern.exec(source);
  }
  return codes;
}

describe('every game/couple route error code has a French message', () => {
  it('finds route files to scan at all (guards against a silently empty sweep)', () => {
    const files = WATCHED.flatMap(routeFiles);
    expect(files.length).toBeGreaterThan(10);
  });

  it('maps every code those routes emit', () => {
    const unmapped: string[] = [];

    for (const file of WATCHED.flatMap(routeFiles)) {
      const relative = path.relative(APP_DIR, file);
      if (NOT_IN_THIS_PRODUCT.some((prefix) => relative.startsWith(prefix))) continue;
      const source = readFileSync(file, 'utf8');
      for (const code of emittedCodes(source)) {
        if (NOT_PLAYER_FACING.has(code)) continue;
        if (COUPLES_ERROR_MESSAGES[code] === undefined) {
          unmapped.push(`${code} (emitted by ${path.relative(APP_DIR, file)})`);
        }
      }
    }

    // Named explicitly so the failure message tells the next author what
    // to add and where, instead of just "expected 3 to be 0".
    expect(unmapped).toEqual([]);
  });
});
