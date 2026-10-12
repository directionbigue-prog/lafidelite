import { describe, expect, it } from 'vitest';
import type { Grille } from './grilles';
import {
  definitionA,
  matriceLettres,
  motAttendu,
  positionDepart,
  trouverGrille,
  tousLesEmplacements,
} from './etat';

describe('positionDepart', () => {
  it('démarre sans mot trouvé, « un » au trait, aucun passage', () => {
    const etat = positionDepart('avril');
    expect(etat).toEqual({ idGrille: 'avril', trouves: [], trait: 'un', passesConsecutifs: 0 });
  });

  it('refuse une grille inconnue', () => {
    expect(() => positionDepart('inexistante')).toThrow(/inconnue/);
  });
});

describe('trouverGrille', () => {
  it('retrouve une grille par son identifiant', () => {
    expect(trouverGrille('avril').id).toBe('avril');
  });

  it('lève sur un identifiant inconnu', () => {
    expect(() => trouverGrille('zzz')).toThrow(/inconnue/);
  });
});

describe('motAttendu et definitionA', () => {
  const grille = trouverGrille('avril');

  it('lit le mot et la définition au bon emplacement', () => {
    expect(motAttendu(grille, { direction: 'horizontal', index: 0 })).toBe('aimer');
    expect(motAttendu(grille, { direction: 'vertical', index: 0 })).toBe('avril');
    expect(definitionA(grille, { direction: 'horizontal', index: 0 })).toMatch(/premier jour/);
  });
});

describe('tousLesEmplacements', () => {
  it('donne les six emplacements, horizontaux puis verticaux', () => {
    expect(tousLesEmplacements()).toEqual([
      { direction: 'horizontal', index: 0 },
      { direction: 'horizontal', index: 1 },
      { direction: 'horizontal', index: 2 },
      { direction: 'vertical', index: 0 },
      { direction: 'vertical', index: 1 },
      { direction: 'vertical', index: 2 },
    ]);
  });
});

describe('matriceLettres', () => {
  it('reproduit exactement l’exemple de la spec pour la grille « avril »', () => {
    // aimer / rires / lente à l'horizontale, avril / marin / reste à la
    // verticale — l'exemple donné dans grilles.ts et dans la spec.
    const grille = trouverGrille('avril');
    expect(matriceLettres(grille)).toEqual([
      ['a', 'i', 'm', 'e', 'r'],
      ['v', null, 'a', null, 'e'],
      ['r', 'i', 'r', 'e', 's'],
      ['i', null, 'i', null, 't'],
      ['l', 'e', 'n', 't', 'e'],
    ]);
  });

  function grillePersonnalisee(overrides: Partial<Grille>): Grille {
    return {
      id: 'test',
      horizontaux: [
        { mot: 'aimer', definition: 'd' },
        { mot: 'rires', definition: 'd' },
        { mot: 'lente', definition: 'd' },
      ],
      verticaux: [
        { mot: 'avril', definition: 'd' },
        { mot: 'marin', definition: 'd' },
        { mot: 'reste', definition: 'd' },
      ],
      ...overrides,
    };
  }

  it('lève quand un croisement ne concorde pas — la garde qui protège les grilles', () => {
    // « avril »[1] = 'v', mais l'horizontal 0 ('aimer') attend 'a' en
    // colonne 0. Une faute de frappe typique : une lettre change sans que
    // l'autre mot du croisement ne suive.
    const grille = grillePersonnalisee({
      verticaux: [
        { mot: 'zvril', definition: 'd' }, // 'a' -> 'z' : casse le croisement avec « aimer »
        { mot: 'marin', definition: 'd' },
        { mot: 'reste', definition: 'd' },
      ],
    });
    expect(() => matriceLettres(grille)).toThrow(/Croisement incohérent/);
  });

  it('lève quand un mot ne compte pas cinq lettres', () => {
    const grille = grillePersonnalisee({
      horizontaux: [
        { mot: 'aime', definition: 'd' },
        { mot: 'rires', definition: 'd' },
        { mot: 'lente', definition: 'd' },
      ],
    });
    expect(() => matriceLettres(grille)).toThrow(/ne compte pas/);
  });
});
