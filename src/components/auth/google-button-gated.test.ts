// Tripwire: the Google button may never be rendered unconditionally.
//
// `/api/auth/oauth/google/start` answers 404 when GOOGLE_CLIENT_ID or
// GOOGLE_CLIENT_SECRET is unset — the starter's deliberate "inert provider"
// pattern, and the state this repo is in today. A "Continuer avec Google"
// button rendered regardless would therefore sit at the top of both primary
// auth forms and lead nowhere: the exact dead-affordance class that was
// just cleared out of the landing page, the pairing screen and the OAuth
// error page.
//
// The gate is easy to lose. Someone adds a third auth screen, copies the
// GoogleButton import, and forgets the prop — and nothing fails, because in
// a CONFIGURED environment the button works. That is what makes this worth
// asserting rather than reviewing: the bug is invisible wherever OAuth
// happens to be set up.
//
// Source-level, because the repo ships no jsdom and these components cannot
// be mounted in a test.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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

/** Files that render `<GoogleButton …>`, excluding its own definition. */
function consumers(): { file: string; source: string }[] {
  return sourceFiles(SRC_DIR)
    .map((file) => ({ file: path.relative(SRC_DIR, file), source: readFileSync(file, 'utf8') }))
    .filter(
      ({ file, source }) => !file.endsWith('GoogleButton.tsx') && source.includes('<GoogleButton'),
    );
}

describe('the Google sign-in button stays behind the server-side gate', () => {
  it('is actually used somewhere (guards against a vacuous sweep)', () => {
    expect(consumers().length).toBeGreaterThan(0);
  });

  it('is never rendered without a googleEnabled guard standing before it', () => {
    // Asserted on POSITION, not on the mere presence of the identifier.
    // The first version of this test only checked that the file mentioned
    // `googleEnabled` somewhere — and passed when the guard was replaced by
    // `{true && (`, because the prop's type annotation still contained the
    // word. It could not fail, which is the one thing a tripwire must be
    // able to do.
    const ungated = consumers()
      .filter(({ source }) => {
        const guard = source.indexOf('googleEnabled &&');
        const button = source.indexOf('<GoogleButton');
        return guard === -1 || guard > button;
      })
      .map(({ file }) => file);

    expect(ungated).toEqual([]);
  });

  it('derives the flag from the same predicate the OAuth route uses', () => {
    // Not from `process.env.GOOGLE_CLIENT_ID` re-read locally, and not from
    // a NEXT_PUBLIC_ mirror: either would let the button and the endpoint
    // drift apart about whether Google is configured.
    const providers = sourceFiles(SRC_DIR)
      .map((file) => ({ file: path.relative(SRC_DIR, file), source: readFileSync(file, 'utf8') }))
      .filter(({ source }) => source.includes('googleEnabled='));

    expect(providers.length).toBeGreaterThan(0);
    for (const { file, source } of providers) {
      expect(source, `${file} should call tryCreateGoogleProvider()`).toContain(
        'tryCreateGoogleProvider',
      );
    }
  });
});
