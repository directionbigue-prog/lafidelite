import { describe, it, expect } from 'vitest';
import {
  passDeviceTarget,
  passDeviceHeading,
  passDeviceInitial,
  passDeviceCtaLabel,
  PARTNER_FALLBACK_NAME,
} from './pass-device';

describe('passDeviceTarget', () => {
  // Both directions are asserted deliberately: a swapped comparison still
  // "works" when you test alone on one device, and would only surface as
  // two people being told to pass the phone to each other forever.
  it('is the viewer’s own turn when the active role matches theirs (creator)', () => {
    expect(passDeviceTarget('CREATOR', 'CREATOR', 'Karim')).toEqual({ kind: 'self' });
  });

  it('is the viewer’s own turn when the active role matches theirs (partner)', () => {
    expect(passDeviceTarget('PARTNER', 'PARTNER', 'Awa')).toEqual({ kind: 'self' });
  });

  it('hands over when the creator is viewing but it is the partner’s turn', () => {
    expect(passDeviceTarget('PARTNER', 'CREATOR', 'Karim')).toEqual({
      kind: 'partner',
      partnerName: 'Karim',
    });
  });

  it('hands over when the partner is viewing but it is the creator’s turn', () => {
    expect(passDeviceTarget('CREATOR', 'PARTNER', 'Awa')).toEqual({
      kind: 'partner',
      partnerName: 'Awa',
    });
  });

  it('reports unknown rather than guessing when the active role is unrecognized', () => {
    expect(passDeviceTarget('SOMETHING_ELSE', 'CREATOR', 'Karim')).toEqual({ kind: 'unknown' });
    expect(passDeviceTarget('', 'CREATOR', 'Karim')).toEqual({ kind: 'unknown' });
  });

  it('reports unknown when the viewer role is missing', () => {
    expect(passDeviceTarget('CREATOR', '', 'Karim')).toEqual({ kind: 'unknown' });
  });
});

describe('passDeviceHeading', () => {
  it('addresses the viewer directly on their own turn', () => {
    expect(passDeviceHeading({ kind: 'self' })).toBe('À toi de jouer');
  });

  it('names the partner when handing the device over', () => {
    expect(passDeviceHeading({ kind: 'partner', partnerName: 'Karim' })).toBe(
      'Passe le téléphone à Karim',
    );
  });

  it('falls back to a generic phrase when the partner has no name recorded', () => {
    expect(passDeviceHeading({ kind: 'partner', partnerName: null })).toBe(
      `Passe le téléphone à ${PARTNER_FALLBACK_NAME}`,
    );
  });

  it('says so plainly when the turn cannot be attributed', () => {
    expect(passDeviceHeading({ kind: 'unknown' })).toBe('Impossible de savoir à qui est le tour');
  });

  it('never renders a raw role name to the user', () => {
    for (const target of [
      { kind: 'self' } as const,
      { kind: 'partner', partnerName: 'Karim' } as const,
      { kind: 'unknown' } as const,
    ]) {
      const heading = passDeviceHeading(target);
      expect(heading).not.toContain('CREATOR');
      expect(heading).not.toContain('PARTNER');
    }
  });
});

describe('passDeviceInitial', () => {
  it('takes the partner’s initial when the phone is changing hands', () => {
    expect(passDeviceInitial({ kind: 'partner', partnerName: 'Malick' }, 'Aïssatou')).toBe('M');
  });

  it('takes the holder’s own initial when the turn is theirs', () => {
    expect(passDeviceInitial({ kind: 'self' }, 'aïssatou')).toBe('A');
  });

  it('returns null rather than inventing a glyph when there is no name', () => {
    expect(passDeviceInitial({ kind: 'partner', partnerName: null }, 'Aïssatou')).toBeNull();
    expect(passDeviceInitial({ kind: 'partner', partnerName: '  ' }, 'Aïssatou')).toBeNull();
    expect(passDeviceInitial({ kind: 'self' }, null)).toBeNull();
    expect(passDeviceInitial({ kind: 'unknown' }, 'Aïssatou')).toBeNull();
  });
});

describe('passDeviceCtaLabel', () => {
  it('names the person taking the phone', () => {
    expect(passDeviceCtaLabel({ kind: 'partner', partnerName: 'Malick' })).toBe(
      'C’est moi, Malick',
    );
  });

  it('stays generic when there is no name to use', () => {
    expect(passDeviceCtaLabel({ kind: 'partner', partnerName: null })).toBe('C’est moi');
    expect(passDeviceCtaLabel({ kind: 'partner', partnerName: ' ' })).toBe('C’est moi');
  });

  it('speaks to the holder when the turn is already theirs', () => {
    expect(passDeviceCtaLabel({ kind: 'self' })).toBe('C’est à moi');
  });
});
