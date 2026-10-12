import { describe, expect, it } from 'vitest';
import { positionDepart } from './etat';
import { parseEtatLudo } from './etat-schema';

describe('parseEtatLudo — la forme, rien de plus', () => {
  it('accepte la position de départ', () => {
    expect(parseEtatLudo(positionDepart())).toEqual(positionDepart());
  });

  it('accepte un état en cours avec un dé en attente et des pions partout', () => {
    const etat = {
      pions: {
        sud: [
          { zone: 'circuit', progression: 10 },
          { zone: 'colonne', progression: 4 },
          { zone: 'arrivee' },
          { zone: 'enclos' },
        ],
        nord: [
          { zone: 'enclos' },
          { zone: 'enclos' },
          { zone: 'circuit', progression: 0 },
          { zone: 'circuit', progression: 51 },
        ],
      },
      trait: 'nord',
      de: 6,
      sixDAffilee: 2,
    };
    expect(parseEtatLudo(etat)).not.toBeNull();
  });

  it('refuse un trait inconnu', () => {
    const etat = { ...positionDepart(), trait: 'est' };
    expect(parseEtatLudo(etat)).toBeNull();
  });

  it('refuse un dé hors de 1 à 6', () => {
    expect(parseEtatLudo({ ...positionDepart(), de: 0 })).toBeNull();
    expect(parseEtatLudo({ ...positionDepart(), de: 7 })).toBeNull();
  });

  it('accepte un dé absent (null)', () => {
    expect(parseEtatLudo({ ...positionDepart(), de: null })).not.toBeNull();
  });

  it('refuse un compteur de six d’affilée supérieur à 2', () => {
    expect(parseEtatLudo({ ...positionDepart(), sixDAffilee: 3 })).toBeNull();
  });

  it('refuse une progression de circuit hors bornes (52 ou plus)', () => {
    const etat = positionDepart();
    const corrompu = {
      ...etat,
      pions: {
        ...etat.pions,
        sud: [{ zone: 'circuit', progression: 52 }, ...etat.pions.sud.slice(1)],
      },
    };
    expect(parseEtatLudo(corrompu)).toBeNull();
  });

  it('refuse une progression de colonne hors bornes (5 ou plus)', () => {
    const etat = positionDepart();
    const corrompu = {
      ...etat,
      pions: {
        ...etat.pions,
        sud: [{ zone: 'colonne', progression: 5 }, ...etat.pions.sud.slice(1)],
      },
    };
    expect(parseEtatLudo(corrompu)).toBeNull();
  });

  it('refuse un camp avec plus ou moins de quatre pions', () => {
    const etat = positionDepart();
    const troisSeuls = {
      ...etat,
      pions: { ...etat.pions, sud: etat.pions.sud.slice(0, 3) },
    };
    expect(parseEtatLudo(troisSeuls)).toBeNull();
  });

  it('refuse un champ en trop (schéma strict)', () => {
    const etat = { ...positionDepart(), enTrop: true };
    expect(parseEtatLudo(etat)).toBeNull();
  });

  it('refuse un pion avec un champ en trop', () => {
    const etat = positionDepart();
    const corrompu = {
      ...etat,
      pions: {
        ...etat.pions,
        sud: [{ zone: 'enclos', progression: 0 }, ...etat.pions.sud.slice(1)],
      },
    };
    expect(parseEtatLudo(corrompu)).toBeNull();
  });
});
