import { describe, it, expect } from 'vitest';
import { adresseInvite, estAdresseInvite, DOMAINE_INVITE } from './compte-invite';

describe('compte-invite', () => {
  it('fabrique une adresse dans le domaine réservé .invalid', () => {
    const a = adresseInvite('abc');
    expect(a).toBe(`partenaire-abc@${DOMAINE_INVITE}`);
    expect(DOMAINE_INVITE.endsWith('.invalid')).toBe(true);
  });

  it('reconnaît une adresse d’invité, sans tenir compte de la casse', () => {
    expect(estAdresseInvite(adresseInvite('x'))).toBe(true);
    expect(estAdresseInvite(adresseInvite('x').toUpperCase())).toBe(true);
  });

  it('ne confond pas une vraie adresse avec une adresse d’invité', () => {
    expect(estAdresseInvite('awa@gmail.com')).toBe(false);
    expect(estAdresseInvite(`x@evil-${DOMAINE_INVITE}.com`)).toBe(false);
    expect(estAdresseInvite(null)).toBe(false);
    expect(estAdresseInvite(undefined)).toBe(false);
  });
});
