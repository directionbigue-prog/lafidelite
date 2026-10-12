import { describe, expect, it } from 'vitest';
import { adversaire, pionEn, positionDepart, type QuatrePions } from './etat';

describe('positionDepart', () => {
  it('place les huit pions à l’enclos, sud au trait, aucun dé, aucun six lancé', () => {
    const etat = positionDepart();
    expect(etat.pions.sud).toEqual([
      { zone: 'enclos' },
      { zone: 'enclos' },
      { zone: 'enclos' },
      { zone: 'enclos' },
    ]);
    expect(etat.pions.nord).toEqual([
      { zone: 'enclos' },
      { zone: 'enclos' },
      { zone: 'enclos' },
      { zone: 'enclos' },
    ]);
    expect(etat.trait).toBe('sud');
    expect(etat.de).toBeNull();
    expect(etat.sixDAffilee).toBe(0);
  });

  it('rend un nouvel objet à chaque appel — deux positions de départ ne partagent aucune référence', () => {
    const a = positionDepart();
    const b = positionDepart();
    expect(a).not.toBe(b);
    expect(a.pions.sud).not.toBe(b.pions.sud);
  });
});

describe('adversaire', () => {
  it('sud et nord sont chacun l’adversaire de l’autre', () => {
    expect(adversaire('sud')).toBe('nord');
    expect(adversaire('nord')).toBe('sud');
  });
});

describe('pionEn', () => {
  const pions: QuatrePions = [
    { zone: 'enclos' },
    { zone: 'circuit', progression: 5 },
    { zone: 'colonne', progression: 2 },
    { zone: 'arrivee' },
  ];

  it('lit chacun des quatre pions par son index', () => {
    expect(pionEn(pions, 0)).toEqual({ zone: 'enclos' });
    expect(pionEn(pions, 1)).toEqual({ zone: 'circuit', progression: 5 });
    expect(pionEn(pions, 2)).toEqual({ zone: 'colonne', progression: 2 });
    expect(pionEn(pions, 3)).toEqual({ zone: 'arrivee' });
  });

  it('lève pour tout index hors bornes plutôt que de rendre undefined', () => {
    expect(() => pionEn(pions, 4)).toThrow();
    expect(() => pionEn(pions, -1)).toThrow();
  });
});
