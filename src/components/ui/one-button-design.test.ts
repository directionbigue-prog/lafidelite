// Tripwire: there is one definition of what a button looks like.
//
// Before `Button`, the same call-to-action existed as 32 hand-written class
// strings across the app, and they had already drifted: auth screens used
// `bg-gold`, game screens `bg-wine`, and the disabled and hover treatments
// differed screen to screen. One of them was even named SECONDARY while
// being byte-identical to a primary.
//
// Nothing catches that in review. Each string is locally reasonable; only
// lining them up reveals that the platform has two primary buttons. So the
// rule is asserted instead: a pill-shaped CTA gets its classes from
// `Button` — as the component, or via `buttonClass()` for the call sites
// that must stay a raw element.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The landing page is exempt. Its hero CTA is a wine-on-ink treatment
 * belonging to that page's own approved marketing design; folding it into
 * the product's button would redesign a screen nobody asked to change.
 */
const EXEMPT = [
  path.join('app', 'page.tsx'),
  path.join('components', 'ui', 'Button.tsx'),
  // Google's sign-in button has brand requirements of its own (its own
  // fill, its own mark) that the product's button deliberately does not
  // satisfy. Folding it in would break the provider's guidelines.
  path.join('components', 'auth', 'GoogleButton.tsx'),
];

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

describe('the platform has one button design', () => {
  it('finds files to scan at all', () => {
    expect(sourceFiles(SRC_DIR).length).toBeGreaterThan(20);
  });

  it('declares no hand-written pill CTA outside the primitive', () => {
    // Three signals together, because `rounded-full` + a fill alone also
    // describes things that are not buttons and must not be dragged into
    // the button system: the 10px brand dot in each aside
    // (`h-2.5 w-2.5 rounded-full bg-wine`, no padding) and the countdown
    // badge in `Timer` (`px-2 py-1`). A CTA is a pill with an action fill,
    // real horizontal padding, and button-weight type.
    // A fourth signal, added when this rule flagged the results screen's
    // "Niveau Complices" chip: the fill must be OPAQUE. A call to action
    // is a solid `bg-gold`; a translucent `bg-gold/12` is a badge — a
    // label you read, not a control you press. The distinction is the
    // product's, not a carve-out for one file: no button in this codebase
    // is filled with a tint, and no badge is filled solid.
    const isPill = /rounded-full[^"'`]*\bbg-(gold|wine|cream)\b(?!\/)/;
    const hasCtaPadding = /\bpx-(?:[4-9]|1\d)\b|\bpx-\[/;
    const hasButtonWeight = /\bfont-(?:bold|semibold)\b/;
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC_DIR)) {
      const relative = path.relative(SRC_DIR, file);
      if (EXEMPT.includes(relative)) continue;
      const source = readFileSync(file, 'utf8');
      for (const line of source.split('\n')) {
        // `buttonClass(...)` call sites are the sanctioned escape hatch.
        if (
          isPill.test(line) &&
          hasCtaPadding.test(line) &&
          hasButtonWeight.test(line) &&
          !line.includes('buttonClass')
        ) {
          offenders.push(`${relative}: ${line.trim().slice(0, 80)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps one primary colour across the product', () => {
    // The single fact this whole file exists to protect. If someone flips
    // `primary` back to wine, the auth screens and the game screens part
    // company again.
    const button = readFileSync(path.join(SRC_DIR, 'components', 'ui', 'Button.tsx'), 'utf8');
    expect(button).toMatch(/primary:\s*'bg-gold\b/);
  });
});
