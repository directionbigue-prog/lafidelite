// src/lib/server/observability/cron-get-alias.test.ts
//
// Tripwire: every path declared in vercel.json's `crons` must export a GET
// handler, because that is the only verb Vercel ever sends.
//
// From Vercel's own documentation (https://vercel.com/docs/cron-jobs):
//
//     To trigger a cron job, Vercel makes an HTTP GET request to your
//     project's production deployment URL, using the `path` provided in your
//     project's vercel.json file.
//
// All six handlers in this repo exported POST and nothing else. The first
// successful production deployment (2026-10-02) was therefore shipped with
// every scheduled job dead: Vercel's scheduler received a bare 405 Method Not
// Allowed six times a day and the work never ran.
//
// What makes this worth a test rather than a fix-and-move-on is the shape of
// the failure. A cron that is never invoked writes no log line, raises no
// error, and reports no failed invocation — the dashboard shows a schedule,
// the deployment is green, and `outbox-drain` plus `email-queue-drain` simply
// never fire. Two of the six carry user-facing mail. It was found only by
// probing the six paths from outside and noticing the 405s.
//
// The repo already had a vercel-json-shape tripwire asserting that each cron
// path has a route.ts file. A file existing is not the same as a handler
// answering, and that gap is exactly what shipped.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '../../../../');
const VERCEL_JSON = resolve(REPO_ROOT, 'vercel.json');

interface VercelConfig {
  crons?: Array<{ path: string; schedule: string }>;
}

const crons = (JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as VercelConfig).crons ?? [];

/**
 * Strip comments before matching.
 *
 * The first version of this file matched the raw source, and a commented-out
 * `// export const GET = POST;` satisfied it — the suite stayed green through
 * the exact regression it was written to catch. Verified by commenting the line
 * out and watching 13 tests pass. Comments are stripped here so the assertion
 * can only be satisfied by code.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const sourceOf = (cronPath: string) =>
  readFileSync(resolve(REPO_ROOT, 'src/app', cronPath.replace(/^\//, ''), 'route.ts'), 'utf8');

const codeOf = (cronPath: string) => stripComments(sourceOf(cronPath));

describe('every scheduled cron answers the verb Vercel sends', () => {
  it('vercel.json declares at least one cron (guards against a vacuous pass)', () => {
    // Without this, deleting the crons array would make every assertion below
    // iterate an empty list and the suite would go green on no coverage.
    expect(crons.length).toBeGreaterThan(0);
  });

  for (const { path } of crons) {
    it(`${path} exports GET`, () => {
      const code = codeOf(path);
      expect(
        /export\s+(?:const\s+GET\b|async\s+function\s+GET\b|function\s+GET\b)/.test(code),
        `${path}/route.ts exports no GET — Vercel's scheduler will get 405 and the job will never run`,
      ).toBe(true);
    });

    it(`${path} still gates on the cron secret`, () => {
      // The GET alias must not become a second, unguarded entry point. Both
      // verbs resolve to the same handler body, which starts with
      // verifyCronSecret — this asserts the gate is still there at all, and
      // reads stripped code so a mention in a comment cannot satisfy it.
      expect(codeOf(path)).toContain('verifyCronSecret');
    });
  }
});
