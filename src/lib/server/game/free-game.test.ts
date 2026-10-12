import { describe, expect, it } from 'vitest';
import { isFreeGameExempt, FREE_GAME_EXEMPT_ENV } from './free-game';

const LIST = 'couple-a@example.com, couple-b@example.com';

describe('isFreeGameExempt', () => {
  it('exempts an address on the list', () => {
    expect(isFreeGameExempt('couple-a@example.com', LIST)).toBe(true);
    expect(isFreeGameExempt('couple-b@example.com', LIST)).toBe(true);
  });

  it('does not exempt an address that is not on it', () => {
    expect(isFreeGameExempt('someone@example.com', LIST)).toBe(false);
  });

  it('tolerates the casing and spacing a human types into a .env file', () => {
    expect(isFreeGameExempt('Couple-A@Example.COM', LIST)).toBe(true);
    expect(isFreeGameExempt('  couple-a@example.com  ', LIST)).toBe(true);
    expect(isFreeGameExempt('couple-a@example.com', '  COUPLE-A@EXAMPLE.COM  ')).toBe(true);
  });

  // Every one of these is a way the check could quietly exempt everybody,
  // which is how a paid feature becomes free in production without anyone
  // noticing. They all fail closed.
  describe('fails closed', () => {
    it.each([
      ['no variable set', undefined],
      ['an empty variable', ''],
      ['only separators', ',,,'],
      ['only whitespace', '   '],
    ])('%s exempts nobody', (_name, list) => {
      expect(isFreeGameExempt('couple-a@example.com', list)).toBe(false);
    });

    it.each([
      ['no email', undefined],
      ['a null email', null],
      ['an empty email', ''],
      ['a whitespace email', '   '],
    ])('%s is never exempt, whatever the list says', (_name, email) => {
      expect(isFreeGameExempt(email, LIST)).toBe(false);
      // Not even against a list that contains an empty entry, which is
      // what a trailing comma produces.
      expect(isFreeGameExempt(email, 'couple-a@example.com,')).toBe(false);
    });

    it('treats a wildcard as a literal address, not as "everyone"', () => {
      // A `*` that disabled the rule for the whole product is precisely
      // the switch that survives into production.
      expect(isFreeGameExempt('someone@example.com', '*')).toBe(false);
    });
  });

  it('names the variable it reads, so the route and the docs cannot drift', () => {
    expect(FREE_GAME_EXEMPT_ENV).toBe('FREE_GAME_EXEMPT_EMAILS');
  });
});
