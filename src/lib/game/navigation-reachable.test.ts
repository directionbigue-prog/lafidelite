// Tripwire: the game must be reachable by CLICKING, from the landing page.
//
// Why this exists. Every `/jeu` screen worked, every `/api/games/*` route
// worked, and a full game could be played end to end via HTTP — yet a
// visitor could not start one, because two navigation gaps sat between the
// front door and the game:
//
//   1. `app/page.tsx` was built from a Claude Design export whose CTAs were
//      placeholder anchors (`#`, `#prix`). The landing page linked to
//      /demo and to nothing else — there was no route to sign-in, sign-up
//      or the game anywhere on it.
//   2. `app/couple/apparies/page.tsx` — the single screen that /couple/creer,
//      /couple/attente and /invite/[code] all funnel into once a couple is
//      ACTIVE — still said "la première partie arrive bientôt", copy
//      written before the game engine existed, and offered no link onward.
//
// Neither gap is visible from inside the file that contains it: each page
// renders exactly what it says it renders. The defect is in the edges
// BETWEEN pages, which is why it survived per-file review and a green test
// suite, and why the assertion belongs here rather than in either page's
// own tests.
//
// This is a source-level assertion because the repo ships no jsdom or
// Testing Library (see `lib/game/`'s pure-function testing decision), so
// these components cannot be mounted and their links cannot be clicked.
// Reading the source is the strongest available check that the links exist.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { routeForPhase, type GamePhase } from './phase-routes';

const SRC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_DIR = path.join(SRC_DIR, 'app');

const landing = readFileSync(path.join(APP_DIR, 'page.tsx'), 'utf8');
const apparies = readFileSync(path.join(APP_DIR, 'couple', 'apparies', 'page.tsx'), 'utf8');

describe('the landing page routes visitors into the product', () => {
  // Each destination is declared as a named constant and used at least
  // once. Asserting both halves is what makes this fail on either kind of
  // regression: a constant re-pointed at a placeholder, or a CTA quietly
  // reverted to a bare `#` and leaving the constant orphaned.
  const DESTINATIONS: readonly [name: string, route: string, purpose: string][] = [
    ['SIGN_IN_HREF', '/connexion', 'an existing user can sign in'],
    ['SIGN_UP_HREF', '/inscription', 'a new visitor can create an account'],
    ['PLAY_HREF', '/jeu', 'a signed-in couple can start a game'],
  ];

  for (const [name, route, purpose] of DESTINATIONS) {
    it(`links to ${route} so ${purpose}`, () => {
      expect(landing).toContain(`const ${name} = '${route}';`);
      // The constant has to reach an `href`, but not necessarily on its own:
      // since the pricing cards became a single looped card (2026-10-02), the
      // free one points at PLAY_HREF through a conditional. Matching only
      // `href={PLAY_HREF}` failed on that, which would have been a test
      // blocking a fix rather than catching a regression. Both halves still
      // hold: the constant is declared, and it is used inside an href.
      expect(landing).toMatch(new RegExp(`href=\\{[^}]*\\b${name}\\b[^}]*\\}`));
    });
  }

  it('leaves no call-to-action pointing at a placeholder anchor', () => {
    // Scoped to CTAs — the footer's legal/support links are still
    // placeholders for pages this lot does not ship, and failing on those
    // would make this test unfixable without inventing legal copy.
    const ctaBlocks = landing
      .split('\n')
      .filter((line) => /className="[^"]*rounded-full/.test(line) || /href="#"/.test(line));
    const deadCtas = ctaBlocks.filter(
      (line) => line.includes('href="#"') && line.includes('rounded-full'),
    );
    expect(deadCtas).toEqual([]);
  });
});

describe('the pairing flow bridges to the game', () => {
  it('offers freshly-paired couples a link to /jeu', () => {
    expect(apparies).toContain('href="/jeu"');
  });

  it('no longer tells a paired couple to wait for a game that already ships', () => {
    expect(apparies).not.toMatch(/arrive bientôt/);
  });
});

describe('every internal route the app links to actually exists', () => {
  // The check that would have caught two live 404s at once:
  //   - `useUser()`'s default redirect was `/login`, the starter's name for
  //     a page this fork renamed to `/connexion`, so /settings bounced
  //     signed-out visitors to a missing route;
  //   - /settings' own footer linked to `/dashboard`, a starter route this
  //     fork never created.
  // Both read as perfectly ordinary code. Only comparing the link against
  // the filesystem shows the target is not there.
  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next') continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
      // Tests are skipped: they carry illustrative paths (`/x`, fixtures for
      // a route that deliberately does not exist) which are not navigation.
      // This file is the first example — its own comment mentions `/x`.
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  }

  /** Resolves an app-router path to a page.tsx, following `[param]` segments. */
  function routeExists(route: string): boolean {
    let dir = APP_DIR;
    for (const segment of route.split('/').filter(Boolean)) {
      const literal = path.join(dir, segment);
      if (existsSync(literal)) {
        dir = literal;
        continue;
      }
      // A concrete value standing in for a dynamic segment, e.g. /jeu/<id>.
      const dynamic = existsSync(dir)
        ? readdirSync(dir).find((entry) => entry.startsWith('['))
        : undefined;
      if (dynamic === undefined) return false;
      dir = path.join(dir, dynamic);
    }
    return existsSync(path.join(dir, 'page.tsx'));
  }

  function referencedRoutes(): Map<string, Set<string>> {
    const refs = new Map<string, Set<string>>();
    // `href="/x"`, `href: '/x'` and `router.push('/x')` / `router.replace('/x')`.
    //
    // The `href:` property form matters more than it looks. This check spent
    // its first months seeing only literal attributes, which meant every
    // link driven by a data table was invisible to it — including the app's
    // own sidebar, whose destinations live in `AppShell`'s NAV array and
    // reach the DOM as `href={item.href}`. A test named "every internal
    // route the app links to actually exists" that cannot see the main
    // navigation promises more than it delivers, so the property form is
    // part of the net now.
    const pattern = /(?:href="|href:\s*['"]|router\.(?:push|replace)\(')(\/[a-z0-9/_-]*)/g;

    // Template literals: router.push(`/jeu/${id}/question`), href={`/x/${y}`}.
    // Every screen of a game in progress is reached this way, so a net that
    // only reads quoted strings never sees them. `${...}` is replaced with a
    // segment that cannot exist on disk, which makes `routeExists` fall
    // through to its `[param]` lookup — exactly the right question to ask of
    // a value substituted at runtime.
    const templatePattern = /(?:router\.(?:push|replace)\(`|href=\{`)(\/[^`]*)/g;
    const DYNAMIC = '_dyn_';

    function record(route: string, file: string): void {
      // `/api/*` are route handlers, not pages; `/` is the landing page.
      if (route === '/' || route.startsWith('/api')) return;
      const seen = refs.get(route) ?? new Set<string>();
      seen.add(path.relative(SRC_DIR, file));
      refs.set(route, seen);
    }

    for (const file of sourceFiles(SRC_DIR)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(pattern)) {
        if (match[1] !== undefined) record(match[1], file);
      }
      for (const match of source.matchAll(templatePattern)) {
        const raw = match[1];
        if (raw === undefined) continue;
        const route = raw.replace(/\$\{[^}]*\}/g, DYNAMIC);
        // A path still carrying an expression after substitution — a whole
        // segment computed by a lookup, say — cannot be resolved from the
        // source alone. Skipping it is honest; asserting on it would not be.
        if (!/^\/[a-z0-9/_-]*$/.test(route)) continue;
        record(route, file);
      }
    }
    return refs;
  }

  it('finds internal links to check at all', () => {
    expect(referencedRoutes().size).toBeGreaterThan(4);
  });

  it('resolves every linked route to a page', () => {
    const broken: string[] = [];
    for (const [route, files] of referencedRoutes()) {
      if (!routeExists(route)) broken.push(`${route} (linked from ${[...files].join(', ')})`);
    }
    expect(broken).toEqual([]);
  });

  // The two screens no pattern can reach. `routeForPhase` builds its path
  // from a lookup table, so the segment never appears as text next to the
  // route — reading the source can only ever see `/jeu/${id}/${SEGMENT[p]}`.
  // Calling the function is both easier and stronger: it is the real router
  // for every screen of a game in progress, and a phase whose folder was
  // renamed would strand the player on a 404 mid-game.
  //
  // Declared as a Record so the type checker, not a reviewer, notices when a
  // phase joins `GamePhase` and this list forgets to.
  it('resolves the destination of every game phase', () => {
    const PHASES: Record<GamePhase, true> = {
      PASS_DEVICE: true,
      ANSWERING: true,
      ROUND_REVEAL: true,
      ROUND_INTRO: true,
      COMPLETE: true,
    };

    const broken: string[] = [];
    for (const phase of Object.keys(PHASES) as GamePhase[]) {
      const route = routeForPhase('id-de-partie', phase);
      if (route === null) broken.push(`${phase} -> aucune route`);
      else if (!routeExists(route)) broken.push(`${phase} -> ${route} (page absente)`);
    }
    expect(broken).toEqual([]);
  });
});
