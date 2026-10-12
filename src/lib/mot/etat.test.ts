import { describe, expect, it } from 'vitest';
import { autreJoueur, mancheActuelle, positionDepart, premiereManche, type EtatMot } from './etat';

describe('positionDepart', () => {
  it('ouvre sur une seule manche, sans mot choisi, « un » proposant à « deux »', () => {
    const etat = positionDepart();
    expect(etat.manches).toEqual([
      { proposeur: 'un', devineur: 'deux', mot: null, tentatives: [] },
    ]);
  });
});

describe('autreJoueur', () => {
  it('échange les deux joueurs, et rien d’autre', () => {
    expect(autreJoueur('un')).toBe('deux');
    expect(autreJoueur('deux')).toBe('un');
  });
});

describe('mancheActuelle et premiereManche', () => {
  it('rendent la même manche tant qu’il n’y en a qu’une', () => {
    const etat = positionDepart();
    expect(mancheActuelle(etat)).toBe(premiereManche(etat));
  });

  it('mancheActuelle rend la SECONDE manche, premiereManche la première', () => {
    const premiere = {
      proposeur: 'un' as const,
      devineur: 'deux' as const,
      mot: 'arbre',
      tentatives: [],
    };
    const seconde = {
      proposeur: 'deux' as const,
      devineur: 'un' as const,
      mot: null,
      tentatives: [],
    };
    const etat: EtatMot = { manches: [premiere, seconde] };
    expect(premiereManche(etat)).toEqual(premiere);
    expect(mancheActuelle(etat)).toEqual(seconde);
  });

  it('lèvent sur un état sans aucune manche — un état que ce module ne produit jamais lui-même', () => {
    const etatVide: EtatMot = { manches: [] };
    expect(() => mancheActuelle(etatVide)).toThrow(/au moins une manche/);
    expect(() => premiereManche(etatVide)).toThrow(/au moins une manche/);
  });
});
