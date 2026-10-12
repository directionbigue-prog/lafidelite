import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  guardPhase,
  isKnownGamePhase,
  mancheIntroExpectedPhases,
  routeForPhase,
  type GamePhase,
} from './phase-routes';

const GAME_ID = 'game_abc123';

describe('routeForPhase', () => {
  it('routes PASS_DEVICE to /passe', () => {
    expect(routeForPhase(GAME_ID, 'PASS_DEVICE')).toBe(`/jeu/${GAME_ID}/passe`);
  });

  it('routes ANSWERING to /question', () => {
    expect(routeForPhase(GAME_ID, 'ANSWERING')).toBe(`/jeu/${GAME_ID}/question`);
  });

  it('routes ROUND_REVEAL to /manche-revelee', () => {
    expect(routeForPhase(GAME_ID, 'ROUND_REVEAL')).toBe(`/jeu/${GAME_ID}/manche-revelee`);
  });

  it('routes ROUND_INTRO to /manche-intro', () => {
    expect(routeForPhase(GAME_ID, 'ROUND_INTRO')).toBe(`/jeu/${GAME_ID}/manche-intro`);
  });

  it('routes COMPLETE to /resultats', () => {
    expect(routeForPhase(GAME_ID, 'COMPLETE')).toBe(`/jeu/${GAME_ID}/resultats`);
  });

  it('embeds the exact game id in the path, not a placeholder', () => {
    expect(routeForPhase('some-other-id-999', 'ANSWERING')).toBe('/jeu/some-other-id-999/question');
  });

  it('returns null for an unrecognized phase, rather than guessing a route', () => {
    expect(routeForPhase(GAME_ID, 'SOME_FUTURE_PHASE')).toBeNull();
  });

  it('returns null for an empty phase string', () => {
    expect(routeForPhase(GAME_ID, '')).toBeNull();
  });

  it('is case-sensitive — lowercase phase names are not recognized', () => {
    expect(routeForPhase(GAME_ID, 'pass_device')).toBeNull();
  });
});

describe('isKnownGamePhase', () => {
  const knownPhases: GamePhase[] = [
    'PASS_DEVICE',
    'ANSWERING',
    'ROUND_REVEAL',
    'ROUND_INTRO',
    'COMPLETE',
  ];

  it.each(knownPhases)('recognizes %s as a known phase', (phase) => {
    expect(isKnownGamePhase(phase)).toBe(true);
  });

  it('rejects an unrecognized phase', () => {
    expect(isKnownGamePhase('INVALID_PHASE')).toBe(false);
  });
});

describe('guardPhase', () => {
  it('stays when the session is on a phase this screen owns', () => {
    expect(guardPhase('g1', 'ROUND_INTRO', ['ROUND_INTRO'])).toEqual({ kind: 'stay' });
    expect(guardPhase('g1', 'ANSWERING', ['PASS_DEVICE', 'ANSWERING'])).toEqual({ kind: 'stay' });
  });

  // The Back-button case: the reveal screen is behind us, the game has
  // moved on, and this screen must not render a stale round.
  it('redirects to where the phase actually belongs', () => {
    expect(guardPhase('g1', 'ROUND_REVEAL', ['ROUND_INTRO'])).toEqual({
      kind: 'redirect',
      path: '/jeu/g1/manche-revelee',
    });
    expect(guardPhase('g1', 'COMPLETE', ['PASS_DEVICE'])).toEqual({
      kind: 'redirect',
      path: '/jeu/g1/resultats',
    });
  });

  it('errors rather than guessing a route for an unrecognized phase', () => {
    expect(guardPhase('g1', 'SOME_FUTURE_PHASE', ['ROUND_INTRO'])).toEqual({ kind: 'error' });
    expect(guardPhase('g1', '', ['ROUND_INTRO'])).toEqual({ kind: 'error' });
  });

  it('never reports stay for a phase outside the expected list', () => {
    for (const phase of ['PASS_DEVICE', 'ANSWERING', 'ROUND_REVEAL', 'COMPLETE']) {
      expect(guardPhase('g1', phase, ['ROUND_INTRO']).kind).not.toBe('stay');
    }
  });
});

// The exact `expected` lists the two interstitial screens pass, pinned
// here rather than only inside the components — a guard that matches
// nothing looks perfectly healthy in isolation, which is how the
// manche-intro screen briefly became unreachable.
describe('guardPhase — the lists the interstitial screens actually use', () => {
  const MANCHE_INTRO = ['ROUND_INTRO', 'PASS_DEVICE'] as const;
  const PASSE = ['PASS_DEVICE', 'ANSWERING'] as const;

  // GET /api/games/current returns the RESOLVED phase, and
  // resolvePhaseOnRead rewrites ROUND_INTRO -> PASS_DEVICE on every read.
  // PASS_DEVICE is therefore the phase manche-intro actually receives when
  // a player arrives from POST /round/advance; guarding on ROUND_INTRO
  // alone skipped the round 2 and 3 intros entirely.
  it('manche-intro stays on the phase the endpoint really returns', () => {
    expect(guardPhase('g1', 'PASS_DEVICE', MANCHE_INTRO)).toEqual({ kind: 'stay' });
    expect(guardPhase('g1', 'ROUND_INTRO', MANCHE_INTRO)).toEqual({ kind: 'stay' });
  });

  it('manche-intro still bounces the phases it must not render', () => {
    expect(guardPhase('g1', 'ROUND_REVEAL', MANCHE_INTRO).kind).toBe('redirect');
    expect(guardPhase('g1', 'COMPLETE', MANCHE_INTRO).kind).toBe('redirect');
    expect(guardPhase('g1', 'ANSWERING', MANCHE_INTRO).kind).toBe('redirect');
  });

  it('passe stays on its own phases and bounces the rest', () => {
    expect(guardPhase('g1', 'PASS_DEVICE', PASSE)).toEqual({ kind: 'stay' });
    expect(guardPhase('g1', 'ANSWERING', PASSE)).toEqual({ kind: 'stay' });
    expect(guardPhase('g1', 'ROUND_REVEAL', PASSE).kind).toBe('redirect');
    expect(guardPhase('g1', 'COMPLETE', PASSE).kind).toBe('redirect');
  });

  // Neither screen may redirect to itself: that is an infinite bounce.
  it('never redirects a screen to its own route', () => {
    for (const phase of ['PASS_DEVICE', 'ANSWERING', 'ROUND_REVEAL', 'COMPLETE', 'ROUND_INTRO']) {
      const intro = guardPhase('g1', phase, MANCHE_INTRO);
      if (intro.kind === 'redirect') expect(intro.path).not.toBe('/jeu/g1/manche-intro');
      const passe = guardPhase('g1', phase, PASSE);
      if (passe.kind === 'redirect') expect(passe.path).not.toBe('/jeu/g1/passe');
    }
  });
});

// Source-level coupling. The block above pins the LIST VALUES, but a
// pure test cannot see which list a component actually passes — reverting
// `manche-intro` to `['ROUND_INTRO']` left every test above green while
// the screen was unreachable in the browser. These assertions close that
// gap the only way a node-only environment can.
describe('the interstitial screens pass the guard lists pinned above', () => {
  const screensDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'app',
    'jeu',
    '[id]',
  );

  // Deliberately NOT matched with a regex over the literal array. The
  // first version of this guard did, and a reviewer pointed out it sat
  // 84 characters wide against a printWidth of 100 with
  // `trailingComma: "all"` — the next edit long enough to make Prettier
  // wrap the array would have appended a comma and silently stopped the
  // pattern matching, leaving a dead guard that still looked green. So
  // these assert on the identifiers a call must mention, which survive
  // any reformatting.
  it('manche-intro derives its accepted phases rather than hardcoding one', () => {
    const source = readFileSync(path.join(screensDir, 'manche-intro', 'page.tsx'), 'utf8');
    expect(source).toContain('mancheIntroExpectedPhases');
    expect(source).toMatch(/guardPhase\(/);
    // The bug this replaces: a bare ROUND_INTRO-only list, which the
    // endpoint can never satisfy.
    expect(source).not.toMatch(/guardPhase\([\s\S]{0,80}\[\s*'ROUND_INTRO'\s*,?\s*\]/);
  });

  it('passe accepts PASS_DEVICE and ANSWERING', () => {
    const source = readFileSync(path.join(screensDir, 'passe', 'page.tsx'), 'utf8');
    const call = /guardPhase\(([\s\S]{0,200}?)\)\s*;/.exec(source);
    expect(call, 'passe/page.tsx must call guardPhase').not.toBeNull();
    const args = call?.[1] ?? '';
    expect(args).toContain("'PASS_DEVICE'");
    expect(args).toContain("'ANSWERING'");
    expect(args).not.toContain("'ROUND_REVEAL'");
    expect(args).not.toContain("'COMPLETE'");
  });
});

describe('mancheIntroExpectedPhases', () => {
  // Question 1 is the only moment a round's intro is legitimate. Later
  // question numbers are ordinary mid-round device hand-offs, which also
  // sit on PASS_DEVICE — accepting them here would re-show the intro card
  // mid-round on a Back button.
  it('accepts the resolved PASS_DEVICE only before the round’s first question', () => {
    expect(mancheIntroExpectedPhases(1)).toEqual(['ROUND_INTRO', 'PASS_DEVICE']);
  });

  it('rejects PASS_DEVICE once the round is under way', () => {
    for (const q of [2, 3, 4, 5]) {
      expect(mancheIntroExpectedPhases(q), `question ${q}`).toEqual(['ROUND_INTRO']);
    }
  });

  it('bounces a mid-round hand-off back to /passe instead of showing the intro', () => {
    expect(guardPhase('g1', 'PASS_DEVICE', mancheIntroExpectedPhases(3))).toEqual({
      kind: 'redirect',
      path: '/jeu/g1/passe',
    });
  });

  it('still lets a real round start render the intro', () => {
    expect(guardPhase('g1', 'PASS_DEVICE', mancheIntroExpectedPhases(1))).toEqual({ kind: 'stay' });
  });
});
