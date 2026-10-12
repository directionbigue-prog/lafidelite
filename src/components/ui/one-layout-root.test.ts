// Tripwire: a full-page root is declared by a shell, not by a page.
//
// This one is written from a defect, not a hunch. `FocusLayout` existed,
// carried a comment claiming "the fourteen pages using it", and was
// imported by ZERO files — while twenty-two hand-written `<main>` roots
// sat across the game and account screens repeating its class string with
// four different gaps and two different paddings between them.
//
// Nothing failed. Every page rendered. The cost only showed up on a wide
// screen, where a layout fix applied to the shell reached none of them and
// the desktop stayed bare — which is precisely how the user found it.
//
// Two rules, because the first alone would not have caught that:
//   1. no page hand-writes a full-page root, and
//   2. the shells are actually used.
// A shell nobody imports passes rule 1 trivially.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Every shell that is allowed to declare a full-page root. Adding one here
 * is a deliberate act: it also opts the file into the importer rule below,
 * so a shell can be added but not left unused.
 *
 * `AppShell` joined the list when the web canvas's sidebar arrived. It was
 * caught by this very test on its first run — which is the intended
 * outcome, not a nuisance: a new full-page root has to be declared as a
 * shell rather than quietly added to an exemption list.
 */
const SHELLS = [
  path.join('components', 'ui', 'FocusLayout.tsx'),
  path.join('components', 'auth', 'AuthSplitLayout.tsx'),
  path.join('components', 'app', 'AppShell.tsx'),
];

/**
 * The landing page owns its own full-bleed marketing layout — sections
 * that bleed edge to edge, its own ambient gradients, its own rhythm. It
 * is not a "one screen, one task" page and folding it into either shell
 * would redesign it.
 */
const EXEMPT = [...SHELLS, path.join('app', 'page.tsx')];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('full-page roots come from a shell', () => {
  it('finds files to scan at all', () => {
    expect(sourceFiles(SRC_DIR).length).toBeGreaterThan(20);
  });

  it('declares no hand-written page root outside the shells', () => {
    // Both signals together. `min-h-screen` alone describes plenty of
    // legitimate inner elements, and `bg-ink` alone describes cards. A
    // full-height element that also paints the page background IS the page
    // root, whatever tag it uses.
    //
    // `app/error.tsx` is deliberately NOT exempt and deliberately not
    // caught: it sets `min-h-screen` without `bg-ink`, because the error
    // boundary must render even if the theme fails to load. If someone
    // later gives it the app background, it becomes a page root like any
    // other and should go through a shell.
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC_DIR)) {
      const relative = path.relative(SRC_DIR, file);
      if (EXEMPT.includes(relative)) continue;
      const source = readFileSync(file, 'utf8');
      for (const [index, line] of source.split('\n').entries()) {
        if (line.includes('min-h-screen') && line.includes('bg-ink')) {
          offenders.push(`${relative}:${index + 1}: ${line.trim().slice(0, 80)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps both shells in actual use', () => {
    // The rule the dead `FocusLayout` broke. A shell with no importers is
    // not a shared decision — it is a file that looks like one.
    const importers = new Map<string, number>(SHELLS.map((shell) => [shell, 0]));

    for (const file of sourceFiles(SRC_DIR)) {
      if (SHELLS.includes(path.relative(SRC_DIR, file))) continue;
      const source = readFileSync(file, 'utf8');
      for (const shell of SHELLS) {
        // Derived from the shell's own path rather than a hardcoded list of
        // folders: the first version checked `components/ui` and
        // `components/auth` only, so a shell added anywhere else would have
        // counted zero importers and failed for the wrong reason — a test
        // that goes red on a correct change is as bad as one that stays
        // green on a broken one.
        const importPath = shell
          .split(path.sep)
          .join('/')
          .replace(/\.tsx$/, '');
        if (source.includes(importPath)) {
          importers.set(shell, (importers.get(shell) ?? 0) + 1);
        }
      }
    }

    for (const [shell, count] of importers) {
      expect(count, `${shell} has no importers`).toBeGreaterThan(0);
    }
  });
});
