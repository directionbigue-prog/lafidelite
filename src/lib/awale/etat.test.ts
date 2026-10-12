import { describe, expect, it } from 'vitest';
import { adversaire, campDuTrou, grainesEn, NB_TROUS, positionDepart } from './etat';

describe('position de départ', () => {
  it('donne quatre graines à chacun des douze trous', () => {
    const etat = positionDepart();
    expect(etat.trous).toHaveLength(NB_TROUS);
    for (let trou = 0; trou < NB_TROUS; trou += 1) {
      expect(grainesEn(etat.trous, trou)).toBe(4);
    }
  });

  it('démarre les deux greniers à zéro', () => {
    expect(positionDepart().greniers).toEqual({ sud: 0, nord: 0 });
  });

  it('donne le trait à sud', () => {
    expect(positionDepart().trait).toBe('sud');
  });

  it('somme bien 48 graines au total', () => {
    const etat = positionDepart();
    const somme = etat.trous.reduce((a, b) => a + b, 0) + etat.greniers.sud + etat.greniers.nord;
    expect(somme).toBe(48);
  });
});

describe('propriété des trous', () => {
  it('donne 0 à 5 à sud', () => {
    for (let trou = 0; trou <= 5; trou += 1) expect(campDuTrou(trou)).toBe('sud');
  });

  it('donne 6 à 11 à nord', () => {
    for (let trou = 6; trou <= 11; trou += 1) expect(campDuTrou(trou)).toBe('nord');
  });
});

describe('adversaire', () => {
  it('est nord pour sud et réciproquement', () => {
    expect(adversaire('sud')).toBe('nord');
    expect(adversaire('nord')).toBe('sud');
  });
});

describe('grainesEn', () => {
  it('rend 0 pour un trou hors plateau, jamais undefined', () => {
    expect(grainesEn([1, 2, 3], 99)).toBe(0);
    expect(grainesEn([1, 2, 3], -1)).toBe(0);
  });
});
