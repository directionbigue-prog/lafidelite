import { describe, expect, it } from 'vitest';
import { estUnMotDuDictionnaire, normaliserMot, validerSaisie } from './dictionnaire';

describe('normaliserMot', () => {
  it('retire les espaces superflus et met en minuscules', () => {
    expect(normaliserMot('  ARBRE  ')).toBe('arbre');
  });

  it('préserve les lettres accentuées, seulement mises en minuscules', () => {
    expect(normaliserMot('ABÎME')).toBe('abîme');
  });
});

describe('estUnMotDuDictionnaire', () => {
  it('accepte un mot réel du dictionnaire, déjà normalisé', () => {
    expect(estUnMotDuDictionnaire('arbre')).toBe(true);
    expect(estUnMotDuDictionnaire('abîme')).toBe(true);
  });

  it('refuse un mot qui n’y figure pas', () => {
    expect(estUnMotDuDictionnaire('xzqwj')).toBe(false);
  });

  it('refuse la forme non normalisée d’un mot pourtant réel', () => {
    // Volontaire : cette fonction ne normalise pas elle-même — c'est
    // `validerSaisie` (ci-dessous) qui enchaîne les deux. La séparation
    // permet à `partie.ts` de valider un mot déjà normalisé sans lui faire
    // subir une seconde normalisation silencieuse.
    expect(estUnMotDuDictionnaire('ARBRE')).toBe(false);
  });

  it('refuse un mot d’une autre longueur', () => {
    expect(estUnMotDuDictionnaire('art')).toBe(false);
    expect(estUnMotDuDictionnaire('arbres')).toBe(false);
  });
});

describe('validerSaisie', () => {
  it('accepte une saisie valide, même mal formatée, et rend le mot normalisé', () => {
    expect(validerSaisie('  Arbre ')).toEqual({ ok: true, mot: 'arbre' });
  });

  it('refuse une saisie qui ne compte pas cinq lettres, avec la bonne raison', () => {
    expect(validerSaisie('art')).toEqual({ ok: false, raison: 'longueur' });
    expect(validerSaisie('arbres')).toEqual({ ok: false, raison: 'longueur' });
  });

  it('refuse une saisie de la bonne longueur mais absente du dictionnaire', () => {
    expect(validerSaisie('xzqwj')).toEqual({ ok: false, raison: 'dictionnaire' });
  });
});
