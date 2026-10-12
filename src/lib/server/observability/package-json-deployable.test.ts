// src/lib/server/observability/package-json-deployable.test.ts
//
// Tripwire: the four properties of package.json that decide whether Vercel
// can build this repo at all. Each one is written from a failure that
// actually shipped, and none of them is observable at runtime — they fail
// during someone else's build, which is why they belong in CI.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '../../../../');

interface Pkg {
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  pnpm?: { overrides?: Record<string, string> };
}

const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')) as Pkg;

describe('package.json is deployable on Vercel', () => {
  // Vercel's framework detection reads the package.json AT THE ROOT DIRECTORY
  // and looks for `next` in dependencies or devDependencies. It found neither
  // for six consecutive deployments on 2026-10-01, and said so in words that
  // name the dependency rather than the cause:
  //
  //     No Next.js version detected. Make sure your package.json has "next"
  //     in either "dependencies" or "devDependencies".
  //
  // `dependencies` specifically, not devDependencies: `next` is needed at
  // RUNTIME by `next start` and by the server Vercel builds.
  it('declares next in dependencies, not only devDependencies', () => {
    expect(pkg.dependencies?.next, 'next must be a production dependency').toBeDefined();
    expect(
      pkg.devDependencies?.next,
      'next must not be duplicated in devDependencies',
    ).toBeUndefined();
  });

  // Vercel caches node_modules between builds, so `postinstall` can be
  // skipped entirely on a warm cache. A build that relies on postinstall for
  // `prisma generate` then fails on a missing Prisma client — intermittently,
  // which is the worst way to fail. Generate from the build script, where it
  // always runs. Keeping postinstall too is harmless and helps local installs.
  it('generates the Prisma client from the build script, not only postinstall', () => {
    const build = pkg.scripts?.build ?? '';
    expect(build).toMatch(/prisma generate/);
    expect(build).toMatch(/next build/);
    expect(
      build.indexOf('prisma generate'),
      'prisma generate must come BEFORE next build',
    ).toBeLessThan(build.indexOf('next build'));
  });

  // `pnpm.overrides` in package.json is read by pnpm 9 and IGNORED by pnpm 10
  // and later, which moved the setting to pnpm-workspace.yaml. The five
  // overrides here are what closed 17 high-severity CVEs and made CI green
  // for the first time; a bump of `packageManager` to pnpm 10+ would silently
  // reopen every one of them, with a green lockfile and no error anywhere.
  //
  // The machine that wrote this had pnpm 11.17.0 installed globally and was
  // saved only by `packageManager` delegating back to 9.15.0.
  //
  // If you DO want pnpm 10+, move the overrides to pnpm-workspace.yaml first,
  // verify `pnpm audit --prod --audit-level=high` is still clean, and then
  // rewrite this test to assert the new home.
  it('pins pnpm 9.x for as long as pnpm.overrides lives in package.json', () => {
    const overrides = pkg.pnpm?.overrides;
    if (!overrides || Object.keys(overrides).length === 0) return;
    expect(
      pkg.packageManager,
      'pnpm.overrides is only read by pnpm 9; packageManager must pin a 9.x',
    ).toMatch(/^pnpm@9\./);
  });

  // The app was flattened out of frontend/ on 2026-10-02. The workspace
  // existed for a single package and cost six failed deployments; re-adding
  // it, or re-nesting the app, brings back "No Next.js version detected".
  it('is a single package at the repo root, with no workspace indirection', () => {
    expect(existsSync(resolve(REPO_ROOT, 'pnpm-workspace.yaml'))).toBe(false);
    expect(existsSync(resolve(REPO_ROOT, 'frontend/package.json'))).toBe(false);
    expect(existsSync(resolve(REPO_ROOT, 'next.config.ts'))).toBe(true);
  });

  // Scripts used to be `pnpm --filter frontend run X` indirections. With one
  // package there is nothing to filter, and a leftover filter fails hard:
  //   "No projects matched the filters".
  it('has no leftover --filter frontend indirection in its scripts', () => {
    const offenders = Object.entries(pkg.scripts ?? {}).filter(([, cmd]) =>
      /--filter\s+frontend/.test(cmd),
    );
    expect(
      offenders,
      `scripts still filtering a package that no longer exists: ${offenders
        .map(([k]) => k)
        .join(', ')}`,
    ).toEqual([]);
  });
});
