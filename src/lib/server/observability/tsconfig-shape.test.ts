// src/lib/server/observability/tsconfig-shape.test.ts
//
// Tripwire: tsconfig.json's `extends` must resolve to a file inside this repo,
// and that base must still turn on the four flags this codebase is written
// against.
//
// Written from a real near-miss. `tsconfig.json` used to live in frontend/ and
// said `"extends": "../tsconfig.base.json"`. Flattening the app to the repo
// root (2026-10-02) left the `..` pointing OUTSIDE the repo, at the user's
// Desktop. TypeScript reports that as a single TS5083 line and then carries on
// with NO base config at all — which silently switched off `strict`,
// `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, and switched off
// `skipLibCheck` too, so the visible symptom was 40-odd bogus TS2615 circular
// reference errors from Prisma's generated .d.ts files. The real error was one
// line, at the top, about a path.
//
// Measured, so that the next reader knows which assertion here actually earns
// its keep: an UNRESOLVABLE `extends` kills the whole Vitest run before any
// assertion executes (`TSConfckParseError: failed to resolve "extends"`, from
// vite:esbuild, on every test file). So the three path assertions below are
// documentation of a failure mode that is already loud — they are cheap, and
// they name the cause the way the raw error does not.
//
// The fourth assertion is the one that bites silently. Dropping `strict`,
// `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` or `skipLibCheck`
// from a base that still RESOLVES leaves Vitest perfectly green while
// `pnpm typecheck` quietly stops checking what this codebase is written
// against. Nothing else in the suite would notice.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, isAbsolute } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '../../../../');
const TSCONFIG = resolve(REPO_ROOT, 'tsconfig.json');

// tsconfig allows comments and trailing commas; this repo's files use neither,
// but strip line comments defensively so a future comment doesn't fail the test
// for the wrong reason.
function readJsonc<T>(path: string): T {
  const raw = readFileSync(path, 'utf8').replace(/^\s*\/\/.*$/gm, '');
  return JSON.parse(raw) as T;
}

interface TsConfig {
  extends?: string;
  compilerOptions?: Record<string, unknown>;
}

describe('tsconfig.json resolves its base config', () => {
  const cfg = readJsonc<TsConfig>(TSCONFIG);

  it('declares an extends', () => {
    expect(cfg.extends).toBeTruthy();
  });

  it('the extends target exists', () => {
    const target = resolve(REPO_ROOT, cfg.extends!);
    expect(existsSync(target), `tsconfig.json extends "${cfg.extends}" → ${target}`).toBe(true);
  });

  it('the extends target is inside the repository', () => {
    // `../tsconfig.base.json` resolved to the parent of the repo and tsc
    // reported it as one easily-missed TS5083 line. A path that escapes the
    // repo cannot work on a fresh clone or in CI, where the parent directory
    // holds something else entirely.
    const target = resolve(REPO_ROOT, cfg.extends!);
    const rel = relative(REPO_ROOT, target);
    expect(
      !rel.startsWith('..') && !isAbsolute(rel),
      `tsconfig.json extends a path outside the repo: "${cfg.extends}"`,
    ).toBe(true);
  });

  it('the base turns on the four flags this codebase is written against', () => {
    const base = readJsonc<TsConfig>(resolve(REPO_ROOT, cfg.extends!));
    const opts = { ...base.compilerOptions, ...cfg.compilerOptions };
    // strict + the two opt-in flags are load-bearing: CLAUDE.md § Conventions
    // tells contributors not to silence them with `any` casts, which only
    // means anything while they are on.
    expect(opts.strict, 'strict').toBe(true);
    expect(opts.noUncheckedIndexedAccess, 'noUncheckedIndexedAccess').toBe(true);
    expect(opts.exactOptionalPropertyTypes, 'exactOptionalPropertyTypes').toBe(true);
    // skipLibCheck is what keeps Prisma's generated types from producing ~40
    // spurious TS2615 errors. Without it, the real error drowns.
    expect(opts.skipLibCheck, 'skipLibCheck').toBe(true);
  });
});
