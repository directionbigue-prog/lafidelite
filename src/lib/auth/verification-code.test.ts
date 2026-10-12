import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cleanVerificationCode,
  verificationCodeError,
  verificationCodeHint,
  VERIFICATION_CODE_ALPHABET,
  VERIFICATION_CODE_LENGTH,
} from './verification-code';

// The cases below were measured against the running server before this
// module existed, by signing up throwaway accounts and posting each shape to
// /api/auth/verify-email. A leading space, a grouping space and a grouping
// dash each answered 400 VALIDATION_FAILED — rendered to the user as "Le
// formulaire contient une erreur."
describe('cleanVerificationCode', () => {
  it('survives the leading space a mail-client copy adds', () => {
    // Measured: ' ABCD2345' -> the old field kept the space and dropped the
    // 5, because maxLength={8} counts the space. 400.
    expect(cleanVerificationCode(' ABCD2345').code).toBe('ABCD2345');
    expect(cleanVerificationCode('\tABCD2345 \r\n').code).toBe('ABCD2345');
  });

  it('uppercases a lowercase paste', () => {
    expect(cleanVerificationCode('abcd2345').code).toBe('ABCD2345');
  });

  it('keeps all eight characters of a code typed with a grouping space', () => {
    // Measured: the worst of the three. maxLength={8} cut the ninth
    // character in the browser, before any handler ran, so the 5 was lost
    // and no amount of retyping recovered it.
    expect(cleanVerificationCode('ABCD 2345').code).toBe('ABCD2345');
    expect(cleanVerificationCode('ABCD-2345').code).toBe('ABCD2345');
  });

  it('drops a trailing full stop rather than relying on truncation', () => {
    // This one used to work, by accident: truncating at 8 threw the period
    // away. It is asserted here because the truncation is now loose, so the
    // accident no longer covers it.
    expect(cleanVerificationCode('ABCD2345.').code).toBe('ABCD2345');
    expect(cleanVerificationCode('ABCD2345 ').code).toBe('ABCD2345');
  });

  it('caps at the code length instead of letting a long paste through', () => {
    expect(cleanVerificationCode('ABCD2345EXTRA').code).toBe('ABCD2345');
    expect(cleanVerificationCode('ABCD2345EXTRA').code).toHaveLength(VERIFICATION_CODE_LENGTH);
  });

  it('reports a confusable glyph rather than silently swallowing it', () => {
    // No substitution is guessed: an O could have been Q, D or G.
    for (const ch of ['0', 'O', 'o', '1', 'I', 'i', 'L', 'l']) {
      const entry = cleanVerificationCode(`ABC${ch}2345`);
      expect(entry.hadConfusable, ch).toBe(true);
      expect(entry.code, ch).toBe('ABC2345');
    }
  });

  it('says nothing about confusables for a clean code', () => {
    expect(cleanVerificationCode('ABCD2345').hadConfusable).toBe(false);
    // A space is formatting noise, not a misreading — no hint for it.
    expect(cleanVerificationCode('ABCD 2345').hadConfusable).toBe(false);
  });

  it('returns an empty string for a value with nothing usable in it', () => {
    expect(cleanVerificationCode('   ').code).toBe('');
    expect(cleanVerificationCode('').code).toBe('');
  });
});

describe('verificationCodeHint', () => {
  it('names the five glyphs a code never contains', () => {
    const hint = verificationCodeHint(cleanVerificationCode('ABCO2345'));
    expect(hint).not.toBeNull();
    for (const ch of ['O', 'I', 'L', '0', '1']) {
      expect(hint).toContain(ch);
    }
  });

  it('stays silent when there is nothing to explain', () => {
    expect(verificationCodeHint(cleanVerificationCode('ABCD2345'))).toBeNull();
  });
});

describe('verificationCodeError', () => {
  it('blocks a short code before the request is spent', () => {
    // Five attempts per fifteen minutes: the field must not spend one on a
    // value the server is certain to refuse.
    const err = verificationCodeError('ABCD23');
    expect(err).not.toBeNull();
    expect(err).toContain('2'); // "il en manque 2"
  });

  it('never announces a negative shortfall', () => {
    expect(verificationCodeError('ABCD2345EXTRA')).toBe(
      `Le code compte ${VERIFICATION_CODE_LENGTH} caractères, pas plus.`,
    );
  });

  it('accepts a well-shaped code', () => {
    expect(verificationCodeError('ABCD2345')).toBeNull();
  });

  it('says nothing about an untouched field', () => {
    expect(verificationCodeError('')).toBeNull();
  });
});

describe('agreement with the server', () => {
  // The browser cannot import lib/server/auth.ts (`server-only`, node:crypto),
  // so the alphabet is restated in this module. That is exactly the kind of
  // copy that drifts — a character added server-side and not here would make
  // the field silently strip valid codes, and every affected user would read
  // "Le formulaire contient une erreur."
  const serverAuth = readFileSync(join(process.cwd(), 'src/lib/server/auth.ts'), 'utf8');

  it('restates the server alphabet character for character', () => {
    const match = /const VERIFICATION_CODE_ALPHABET = '([^']+)'/.exec(serverAuth);
    expect(match, 'VERIFICATION_CODE_ALPHABET not found in lib/server/auth.ts').not.toBeNull();
    expect(match?.[1]).toBe(VERIFICATION_CODE_ALPHABET);
  });

  it('restates the server code length', () => {
    const match = /const VERIFICATION_CODE_LENGTH = (\d+)/.exec(serverAuth);
    expect(match, 'VERIFICATION_CODE_LENGTH not found in lib/server/auth.ts').not.toBeNull();
    expect(Number(match?.[1])).toBe(VERIFICATION_CODE_LENGTH);
  });

  it('excludes every glyph it calls confusable', () => {
    for (const ch of ['0', 'O', '1', 'I', 'L']) {
      expect(VERIFICATION_CODE_ALPHABET).not.toContain(ch);
    }
  });
});
