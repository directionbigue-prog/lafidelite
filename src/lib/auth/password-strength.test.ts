import { describe, expect, it } from 'vitest';
import { passwordStrength, PASSWORD_MIN_LENGTH, STRENGTH_SEGMENTS } from './password-strength';

describe('passwordStrength', () => {
  it('reports nothing at all for an empty field', () => {
    // The meter must not render as "Faible" before the user has typed —
    // that reads as a judgement on nothing.
    expect(passwordStrength('')).toEqual({ level: 'empty', score: 0, label: null });
  });

  it('caps a short password at one segment however varied it is', () => {
    // The server refuses anything under the minimum, so a rich-looking
    // score here would promise an acceptance that cannot happen.
    const short = 'Aa1!';
    expect(short.length).toBeLessThan(PASSWORD_MIN_LENGTH);
    const result = passwordStrength(short);
    expect(result.score).toBe(1);
    expect(result.level).toBe('faible');
  });

  it('rates a long but monotonous password below a varied one of equal length', () => {
    const plain = passwordStrength('motdepasselong');
    const varied = passwordStrength('MotDePasse1!');
    expect(varied.score).toBeGreaterThan(plain.score);
  });

  it('rewards length on an otherwise plain password', () => {
    // 14+ characters lifts a passphrase that uses no symbols or digits —
    // length is what actually resists an offline attack.
    const justLongEnough = passwordStrength('motdepasseab'); // 12
    const clearlyLong = passwordStrength('motdepasselongue'); // 16
    expect(clearlyLong.score).toBeGreaterThan(justLongEnough.score);
  });

  it('reaches the top level only for a long, mixed password', () => {
    const result = passwordStrength('CoeurFidele2026!');
    expect(result.level).toBe('solide');
    expect(result.score).toBe(STRENGTH_SEGMENTS);
  });

  it('never exceeds the number of segments the meter can draw', () => {
    const extreme = passwordStrength('Un!MotDePasse2026Vraiment#Tres$Long%Et&Varie');
    expect(extreme.score).toBeLessThanOrEqual(STRENGTH_SEGMENTS);
  });

  it('always labels a non-empty password', () => {
    for (const candidate of ['a', 'abcdefghij', 'Abcdefghij1', 'Abcdefghij1!']) {
      expect(passwordStrength(candidate).label).not.toBeNull();
    }
  });

  it('keeps the minimum length in step with the signup form', () => {
    // The form's `minLength` and the server's default both say 10. This
    // pins the constant so the meter cannot start disagreeing with the
    // field that uses it.
    expect(PASSWORD_MIN_LENGTH).toBe(10);
  });
});
