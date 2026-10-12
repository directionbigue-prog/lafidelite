import { describe, expect, it } from 'vitest';
import { dashboardGreeting, greetingForHour } from './greeting';

describe('greetingForHour', () => {
  it('says Bonsoir late at night and in the evening', () => {
    for (const h of [0, 3, 4, 18, 21, 23]) {
      expect(greetingForHour(h), `hour ${h}`).toBe('Bonsoir');
    }
  });

  it('says Bonjour through the day', () => {
    for (const h of [5, 9, 12, 17]) {
      expect(greetingForHour(h), `hour ${h}`).toBe('Bonjour');
    }
  });

  it('switches exactly at the boundaries, not one hour off', () => {
    // The off-by-one this pins: 17 is still daytime, 18 is evening; 4 is
    // still night, 5 is morning.
    expect(greetingForHour(4)).toBe('Bonsoir');
    expect(greetingForHour(5)).toBe('Bonjour');
    expect(greetingForHour(17)).toBe('Bonjour');
    expect(greetingForHour(18)).toBe('Bonsoir');
  });

  it('falls back to a neutral form rather than throwing on a broken clock', () => {
    expect(greetingForHour(Number.NaN)).toBe('Bonjour');
  });

  it('addresses the couple with "vous", like the rest of the signed-in product', () => {
    expect(dashboardGreeting(20)).toBe('Bonsoir tous les deux');
    expect(dashboardGreeting(10)).toBe('Bonjour tous les deux');
  });
});
