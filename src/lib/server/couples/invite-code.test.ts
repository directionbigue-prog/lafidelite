import { describe, it, expect } from 'vitest';
import { generateInviteCode, INVITE_CODE_REGEX, INVITE_TTL_MS } from './invite-code';

describe('generateInviteCode', () => {
  it('returns a 6-digit numeric string', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(code).toMatch(INVITE_CODE_REGEX);
  });

  it('produces varied output across many calls (not a constant)', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateInviteCode()));
    expect(codes.size).toBeGreaterThan(1);
  });

  it('zero-pads values below 100000', () => {
    // Statistically near-certain within a handful of tries; if this ever
    // flakes, the padding logic is broken, not the test.
    let sawPadded = false;
    for (let i = 0; i < 500; i++) {
      if (generateInviteCode().startsWith('0')) {
        sawPadded = true;
        break;
      }
    }
    expect(sawPadded).toBe(true);
  });
});

describe('INVITE_TTL_MS', () => {
  it('is exactly 7 days', () => {
    expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
