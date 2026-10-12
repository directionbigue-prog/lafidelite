import { describe, expect, it } from 'vitest';
import type { Pion } from './etat';
import {
  avancer,
  caseAbsolue,
  distanceDe,
  DISTANCE_ARRIVEE,
  entreeDuCamp,
  estCaseSure,
  pionADistance,
  SORTIE_ENCLOS,
  TAILLE_CIRCUIT,
  TAILLE_COLONNE,
} from './plateau';

describe('entreeDuCamp — les deux entrées sont diamétralement opposées', () => {
  it('sud entre en case 0, nord exactement à la moitié du circuit', () => {
    expect(entreeDuCamp('sud')).toBe(0);
    expect(entreeDuCamp('nord')).toBe(26);
    expect(entreeDuCamp('nord') - entreeDuCamp('sud')).toBe(TAILLE_CIRCUIT / 2);
  });
});

describe('caseAbsolue', () => {
  it("place un pion de sud à la case de son numéro : l'entrée est la case 0", () => {
    expect(caseAbsolue('sud', 0)).toBe(0);
    expect(caseAbsolue('sud', 10)).toBe(10);
  });

  it('reboucle correctement pour nord, dont la progression part de la case 26', () => {
    expect(caseAbsolue('nord', 0)).toBe(26);
    expect(caseAbsolue('nord', 25)).toBe(51);
    // 26 + 26 = 52, qui rebouclerait sur lui-même : c'est la case 0, celle
    // de sud. Un pion de nord assez avancé finit donc par visiter
    // l'entrée de sud — sans jamais y repasser deux fois puisqu'il n'y
    // reste qu'un seul tour de circuit à parcourir (progression < 52).
    expect(caseAbsolue('nord', 26)).toBe(0);
    expect(caseAbsolue('nord', 51)).toBe(25);
  });
});

describe('estCaseSure — seules les deux entrées sont sûres', () => {
  it('les cases 0 et 26 sont sûres', () => {
    expect(estCaseSure(0)).toBe(true);
    expect(estCaseSure(26)).toBe(true);
  });

  it("aucune autre case n'est sûre — pas de case étoilée supplémentaire", () => {
    for (let c = 0; c < TAILLE_CIRCUIT; c += 1) {
      if (c === 0 || c === 26) continue;
      expect(estCaseSure(c)).toBe(false);
    }
  });
});

describe('distanceDe / pionADistance — aller-retour sur toute la piste', () => {
  it('distanceDe(pionADistance(d)) === d pour toute distance de 0 à DISTANCE_ARRIVEE', () => {
    for (let d = 0; d <= DISTANCE_ARRIVEE; d += 1) {
      const pion = pionADistance(d);
      expect(pion.zone).not.toBe('enclos');
      expect(distanceDe(pion as Exclude<Pion, { zone: 'enclos' }>)).toBe(d);
    }
  });

  it('les 52 premières distances sont sur le circuit, les 5 suivantes en colonne', () => {
    expect(pionADistance(0)).toEqual({ zone: 'circuit', progression: 0 });
    expect(pionADistance(51)).toEqual({ zone: 'circuit', progression: 51 });
    expect(pionADistance(52)).toEqual({ zone: 'colonne', progression: 0 });
    expect(pionADistance(56)).toEqual({ zone: 'colonne', progression: 4 });
    expect(pionADistance(57)).toEqual({ zone: 'arrivee' });
    expect(DISTANCE_ARRIVEE).toBe(TAILLE_CIRCUIT + TAILLE_COLONNE);
  });
});

describe('avancer', () => {
  it('avance normalement sur le circuit', () => {
    expect(avancer({ zone: 'circuit', progression: 10 }, 4)).toEqual({
      zone: 'circuit',
      progression: 14,
    });
  });

  it('bascule du circuit vers la colonne sans à-coup à la frontière (51 -> 52)', () => {
    expect(avancer({ zone: 'circuit', progression: 50 }, 2)).toEqual({
      zone: 'colonne',
      progression: 0,
    });
  });

  it("atteint exactement l'arrivée avec le score juste", () => {
    expect(avancer({ zone: 'colonne', progression: 3 }, 2)).toEqual({ zone: 'arrivee' });
  });

  it("dépasse l'arrivée si on ne borne pas ailleurs — avancer seul ne refuse rien", () => {
    // avancer() est une fonction de géométrie pure : elle ne connaît pas la
    // notion de coup illégal, c'est coups.coupPossiblePourPion qui refuse
    // en amont un dé trop grand. Ce test documente cette séparation : sans
    // le garde-fou de coups.ts, avancer produirait une distance hors
    // bornes plutôt que de lever — d'où l'importance de ne jamais
    // l'appeler directement depuis l'écran sans passer par coupsLegaux.
    const resultat = pionADistance(distanceDe({ zone: 'colonne', progression: 3 }) + 5);
    expect(resultat).toEqual({ zone: 'arrivee' }); // pionADistance plafonne, elle ne rejette pas
  });
});

describe('SORTIE_ENCLOS', () => {
  it("est la distance 0, donc la case d'entrée du camp propriétaire", () => {
    expect(SORTIE_ENCLOS).toEqual({ zone: 'circuit', progression: 0 });
    expect(caseAbsolue('sud', SORTIE_ENCLOS.progression)).toBe(entreeDuCamp('sud'));
    expect(caseAbsolue('nord', SORTIE_ENCLOS.progression)).toBe(entreeDuCamp('nord'));
  });
});
