// src/lib/server/observability/vercel-json-shape.test.ts — Phase 5 D-20.
//
// Tripwire: verifies vercel.json declares all 6 cron schedules with valid
// cron-format strings and paths that correspond to actual route.ts files.
// (5 Phase-5 canonical + 1 post-audit email-job-purge.)
//
// Guards against route-rename / schedule-drift regressions where a developer
// renames a cron route file but forgets vercel.json (or vice versa).
//
// There is exactly ONE vercel.json, at the repository root, because the app
// itself lives at the repository root — see the second describe block.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import fg from 'fast-glob';

// src/lib/server/observability/ → the repo root is 4 levels up. Since the
// app was flattened out of frontend/ (2026-10-02) that is also the app root.
const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '../../../../');
const VERCEL_JSON = resolve(REPO_ROOT, 'vercel.json');
const APP_API_CRON = resolve(REPO_ROOT, 'src/app/api/cron');

const PATH_RE = /^\/api\/cron\/[a-z][a-z0-9-]*$/;
// Permissive cron-format: 5 fields, each containing only digits, *, /, ,, -, or whitespace
const SCHED_RE = /^[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+$/;

interface VercelConfig {
  crons?: Array<{ path: string; schedule: string }>;
}

describe('vercel.json schema (CRON-07, D-20)', () => {
  it('vercel.json exists at the repository root', () => {
    expect(existsSync(VERCEL_JSON)).toBe(true);
  });

  it('declares exactly 7 cron schedules', () => {
    const cfg = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as VercelConfig;
    expect(cfg.crons).toBeDefined();
    expect(cfg.crons!.length).toBe(7);
  });

  it('every cron path matches /^\\/api\\/cron\\/[a-z-]+$/ and schedule is valid 5-field cron', () => {
    const cfg = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as VercelConfig;
    for (const c of cfg.crons ?? []) {
      expect(c.path).toMatch(PATH_RE);
      expect(c.schedule).toMatch(SCHED_RE);
    }
  });

  it('every cron path corresponds to an existing app/api/cron/<name>/route.ts file', async () => {
    const cfg = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as VercelConfig;
    const routeFiles = await fg('*/route.ts', { cwd: APP_API_CRON, onlyFiles: true });
    const routeNames = new Set(routeFiles.map((f) => f.split('/')[0]));
    for (const c of cfg.crons ?? []) {
      const name = c.path.replace('/api/cron/', '');
      expect(
        routeNames.has(name),
        `vercel.json declares /api/cron/${name} but no route.ts found`,
      ).toBe(true);
    }
  });

  it('declares schedules for the 7 canonical crons (Phase 5 + post-audit + rappels)', () => {
    const cfg = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as VercelConfig;
    const paths = (cfg.crons ?? []).map((c) => c.path).sort();
    expect(paths).toEqual([
      '/api/cron/email-job-purge',
      '/api/cron/email-queue-drain',
      '/api/cron/order-expiration',
      '/api/cron/outbox-drain',
      '/api/cron/rappels-couple',
      '/api/cron/verification-cleanup',
      '/api/cron/webhook-log-purge',
    ]);
  });

  // Vercel REFUSES TO DEPLOY a cron that runs more than once a day on a
  // Hobby account:
  //
  //     Hobby accounts are limited to daily cron jobs. This cron
  //     expression would run more than once per day.
  //
  // Four of these six were sub-daily (two every minute, one hourly, one
  // every five minutes) and the whole deployment failed. The rule is
  // mechanical: the minute and hour fields must each be ONE fixed number.
  // A `*`, a step (`*/5`), a list (`0,30`) or a range (`1-5`) in either
  // field means more than one run per day.
  //
  // This belongs in a test precisely because nothing in the app can catch
  // it: the failure happens at deploy time, not at runtime. The previous
  // assertion accepted any 5-field expression, so it stayed green through
  // a config that could not ship.
  //
  // If you upgrade to Pro, per-minute schedules become legal again — and
  // then it is THIS test you delete, not the schedules you sneak past it.
  it('every schedule is legal on a Hobby account (at most once per day)', () => {
    const cfg = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as VercelConfig;
    const FIXED = /^\d+$/;

    for (const c of cfg.crons ?? []) {
      const [minute, hour] = c.schedule.split(/\s+/);
      expect(
        FIXED.test(minute ?? ''),
        `${c.path}: minute field "${minute}" is not a fixed number, so this runs more than once a day`,
      ).toBe(true);
      expect(
        FIXED.test(hour ?? ''),
        `${c.path}: hour field "${hour}" is not a fixed number, so this runs more than once a day`,
      ).toBe(true);
    }
  });

  // The outbox FEEDS the email queue: outbox-drain moves rows into it,
  // email-queue-drain sends them. Draining the queue first would leave
  // anything the outbox just produced sitting for a further 24 hours.
  //
  // Hobby also warns that a job "configured as 0 1 * * * will trigger
  // anywhere between 1:00 am and 1:59 am" — the jitter stays inside the
  // declared hour, so one full hour of separation is enough to guarantee
  // the order. Minutes are decorative at this precision; hours are not.
  it('drains the outbox in an earlier hour than the email queue', () => {
    const cfg = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as VercelConfig;
    const hourOf = (path: string) => {
      const c = (cfg.crons ?? []).find((x) => x.path === path);
      return Number(c?.schedule.split(/\s+/)[1]);
    };

    const outbox = hourOf('/api/cron/outbox-drain');
    const queue = hourOf('/api/cron/email-queue-drain');
    expect(Number.isFinite(outbox)).toBe(true);
    expect(Number.isFinite(queue)).toBe(true);
    expect(
      outbox,
      `outbox-drain (${outbox}h) must run before email-queue-drain (${queue}h)`,
    ).toBeLessThan(queue);
  });
});

// Why there must be exactly ONE vercel.json, at the repository root.
//
// Vercel reads the config at the project's Root Directory — a dashboard
// setting that no file in this repo can carry (`rootDirectory` is not a
// vercel.json property; the documented property table has no such key).
//
// This app used to live in frontend/, under a one-package pnpm workspace.
// A Vercel project left pointing at the repository root therefore read a
// root package.json that was a workspace orchestrator with no `next` in it,
// and refused to build at all: "No Next.js version detected". That happened
// six times running on 2026-10-01. The workaround — a SECOND vercel.json at
// the root, forcing the framework and filtering the build through the
// workspace — made the misconfiguration survivable but introduced a worse
// hazard: whichever of the two configs Vercel happened to read decided which
// crons got registered, depending on a setting nobody was looking at.
//
// On 2026-10-02 the app was flattened to the repository root instead. There
// is now one package, one vercel.json, and nothing to drift. This block
// exists to keep it that way: re-nesting the app without consolidating the
// config is the regression it catches.
describe('the flattened layout stays flattened', () => {
  it('there is no second vercel.json under frontend/', () => {
    expect(existsSync(resolve(REPO_ROOT, 'frontend/vercel.json'))).toBe(false);
  });

  it('the app root and the repo root are the same directory', () => {
    // next.config.ts and package.json sit beside vercel.json. If a refactor
    // pushes the app back down a level, these go missing and the "No Next.js
    // version detected" failure mode is back.
    expect(existsSync(resolve(REPO_ROOT, 'next.config.ts'))).toBe(true);
    expect(existsSync(resolve(REPO_ROOT, 'package.json'))).toBe(true);
    expect(existsSync(resolve(REPO_ROOT, 'src/app'))).toBe(true);
  });

  it('declares no build/install/output overrides it no longer needs', () => {
    // Zero-config is the point. Every override here is a thing that can
    // disagree with reality: the old root config pinned
    // `outputDirectory: frontend/.next`, which is now simply wrong.
    const cfg = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as Record<string, unknown>;
    expect(cfg.outputDirectory).toBeUndefined();
    expect(cfg.buildCommand).toBeUndefined();
    expect(cfg.installCommand).toBeUndefined();
  });
});
