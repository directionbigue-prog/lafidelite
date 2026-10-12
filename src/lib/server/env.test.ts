import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { envInt, envStr } from './env';

describe('envInt', () => {
  it('returns the fallback when the variable is absent', () => {
    expect(envInt(undefined, 10)).toBe(10);
  });

  it('returns the fallback when the variable is DECLARED BUT BLANK', () => {
    // The whole point: `Number('')` is 0, so `Number(env ?? 10)` silently
    // turns a blank line in .env into a zero-valued setting.
    expect(envInt('', 10)).toBe(10);
    expect(envInt('   ', 10)).toBe(10);
  });

  it('returns the fallback for a value that is not a number', () => {
    expect(envInt('douze', 10)).toBe(10);
    expect(envInt('NaN', 10)).toBe(10);
  });

  it('parses a configured value, whitespace included', () => {
    expect(envInt('20', 10)).toBe(20);
    expect(envInt(' 20 ', 10)).toBe(20);
  });

  it('honours a deliberately configured zero', () => {
    // Distinct from blank: someone who writes `=0` means it. Only the
    // accidental zero is corrected.
    expect(envInt('0', 10)).toBe(0);
  });
});

describe('envStr', () => {
  it('falls back for absent and blank alike', () => {
    expect(envStr(undefined, 'app')).toBe('app');
    expect(envStr('', 'app')).toBe('app');
    expect(envStr('  ', 'app')).toBe('app');
  });

  it('trims a configured value', () => {
    expect(envStr(' prod ', 'app')).toBe('prod');
  });
});

describe('no call site reintroduces the blank-becomes-zero pattern', () => {
  // A tripwire, because the defect is invisible at the call site:
  // `Number(process.env.X ?? 10)` reads as correct and behaves correctly
  // in every environment where the variable is either set or absent. It
  // only misbehaves for a declared-but-empty value, which no test with a
  // clean environment will ever produce.
  const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next') continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
      else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full);
    }
    return out;
  }

  it('finds source files to scan at all', () => {
    expect(sourceFiles(SRC).length).toBeGreaterThan(50);
  });

  it('wraps every numeric env read in envInt', () => {
    const offenders: string[] = [];
    // `Number(process.env.X ...)` or `parseInt(process.env.X ...)`.
    const pattern = /(?:Number|parseInt|parseFloat)\(\s*process\.env\./g;
    // This module and its test spell the pattern out in prose to explain
    // what they exist to prevent; they are the fix, not an instance of it.
    const SELF = [path.join('lib', 'server', 'env.ts'), path.join('lib', 'server', 'env.test.ts')];

    for (const file of sourceFiles(SRC)) {
      const relative = path.relative(SRC, file);
      if (SELF.includes(relative)) continue;
      const source = readFileSync(file, 'utf8');
      if (pattern.test(source)) offenders.push(relative);
      pattern.lastIndex = 0;
    }

    expect(offenders).toEqual([]);
  });
});
