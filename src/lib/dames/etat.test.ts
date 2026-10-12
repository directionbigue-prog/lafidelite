import { describe, expect, it } from 'vitest';
import { positionDepart, pieceEn, adversaire, plateauVide } from './etat';

describe('position de départ', () => {
  const depart = positionDepart();

  it('donne les cases 1 à 20 aux noirs', () => {
    for (let n = 1; n <= 20; n += 1) {
      expect(pieceEn(depart.cases, n)).toEqual({ camp: 'noir', dame: false });
    }
  });

  it('laisse les deux rangées du milieu vides', () => {
    for (let n = 21; n <= 30; n += 1) {
      expect(pieceEn(depart.cases, n)).toBeNull();
    }
  });

  it('donne les cases 31 à 50 aux blancs', () => {
    for (let n = 31; n <= 50; n += 1) {
      expect(pieceEn(depart.cases, n)).toEqual({ camp: 'blanc', dame: false });
    }
  });

  it('ne place aucune dame au départ', () => {
    expect(depart.cases.filter((c) => c?.dame)).toEqual([]);
  });

  it('fait ouvrir les blancs', () => {
    expect(depart.trait).toBe('blanc');
  });

  it('compte exactement 50 cases', () => {
    expect(depart.cases).toHaveLength(50);
  });
});

describe('lecture sûre du plateau', () => {
  it('rend null hors du damier plutôt que undefined', () => {
    // `noUncheckedIndexedAccess` fait de cases[i] un `Case | undefined`.
    // Le moteur ne doit jamais avoir à distinguer les deux.
    expect(pieceEn(plateauVide(), 0)).toBeNull();
    expect(pieceEn(plateauVide(), 51)).toBeNull();
  });
});

describe('camps', () => {
  it('oppose les deux camps', () => {
    expect(adversaire('blanc')).toBe('noir');
    expect(adversaire('noir')).toBe('blanc');
  });
});
