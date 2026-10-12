import { describe, expect, it } from 'vitest';
import { coupPossiblePourPion, coupsLegaux } from './coups';
import type { EtatLudo, Pion, QuatrePions } from './etat';

function etatAvec(pions: QuatrePions, adverses: QuatrePions, de: number | null): EtatLudo {
  return {
    pions: { sud: pions, nord: adverses },
    trait: 'sud',
    de,
    sixDAffilee: 0,
  };
}

const QUATRE_ENCLOS: QuatrePions = [
  { zone: 'enclos' },
  { zone: 'enclos' },
  { zone: 'enclos' },
  { zone: 'enclos' },
];

describe('coupPossiblePourPion — règle délicate n°1 : il faut un six pour sortir', () => {
  it('un pion à l’enclos ne peut jouer qu’un six', () => {
    const enclos: Pion = { zone: 'enclos' };
    for (let de = 1; de <= 6; de += 1) {
      expect(coupPossiblePourPion(enclos, de)).toBe(de === 6);
    }
  });

  it('un pion déjà arrivé ne peut plus jamais jouer, quel que soit le dé', () => {
    const arrivee: Pion = { zone: 'arrivee' };
    for (let de = 1; de <= 6; de += 1) {
      expect(coupPossiblePourPion(arrivee, de)).toBe(false);
    }
  });
});

describe('coupPossiblePourPion — règle délicate n°2 : le score exact pour finir', () => {
  it('une distance de 55 (colonne, progression 3) accepte un 2 exact et refuse un 3', () => {
    // distance 55 = 52 (circuit) + 3 ; + 2 = 57 = DISTANCE_ARRIVEE pile ;
    // + 3 = 58, un pas de trop.
    const pion: Pion = { zone: 'colonne', progression: 3 };
    expect(coupPossiblePourPion(pion, 2)).toBe(true);
    expect(coupPossiblePourPion(pion, 3)).toBe(false);
  });

  it('sur le circuit, un dé qui dépasserait la case finale est refusé', () => {
    // distance 50 (circuit) + 6 = 56, encore dans la colonne (< 57) : accepté.
    // distance 50 (circuit) + 7 n'existe pas (dé à 6 faces), donc on teste
    // la frontière réelle : distance 51 + 6 = 57, pile ; distance 52 + 6 =
    // 58, refusé.
    expect(coupPossiblePourPion({ zone: 'circuit', progression: 51 }, 6)).toBe(true);
    expect(coupPossiblePourPion({ zone: 'colonne', progression: 0 }, 6)).toBe(false);
  });
});

describe('coupsLegaux', () => {
  it('rend un tableau vide tant qu’aucun dé n’a été lancé', () => {
    const etat = etatAvec(QUATRE_ENCLOS, QUATRE_ENCLOS, null);
    expect(coupsLegaux(etat)).toEqual([]);
  });

  it('avec un six, seuls les pions à l’enclos ou pouvant avancer sans dépasser sont légaux', () => {
    const pions: QuatrePions = [
      { zone: 'enclos' }, // sort avec un six : légal
      { zone: 'circuit', progression: 10 }, // avance à 16 : légal
      { zone: 'colonne', progression: 0 }, // 52 + 6 = 58 > 57 : illégal
      { zone: 'arrivee' }, // jamais légal
    ];
    const etat = etatAvec(pions, QUATRE_ENCLOS, 6);
    expect(coupsLegaux(etat)).toEqual([0, 1]);
  });

  it('sans six, les pions à l’enclos sont exclus mais les autres restent jouables', () => {
    const pions: QuatrePions = [
      { zone: 'enclos' }, // pas de six : illégal
      { zone: 'circuit', progression: 3 }, // + 4 = 7 : légal
      { zone: 'colonne', progression: 4 }, // 56 + 4 = 60 > 57 : illégal
      { zone: 'arrivee' }, // jamais légal
    ];
    const etat = etatAvec(pions, QUATRE_ENCLOS, 4);
    expect(coupsLegaux(etat)).toEqual([1]);
  });

  it('rend un tableau vide quand tous les pions du camp au trait sont bloqués — le tour devra passer', () => {
    const pions: QuatrePions = [
      { zone: 'enclos' },
      { zone: 'enclos' },
      { zone: 'colonne', progression: 4 }, // 56 + 3 = 59 > 57
      { zone: 'arrivee' },
    ];
    const etat = etatAvec(pions, QUATRE_ENCLOS, 3);
    expect(coupsLegaux(etat)).toEqual([]);
  });

  it('ne regarde que les pions du camp au trait, jamais ceux de l’adversaire', () => {
    const pionsSud: QuatrePions = [
      { zone: 'enclos' },
      { zone: 'enclos' },
      { zone: 'enclos' },
      { zone: 'enclos' },
    ];
    const pionsNord: QuatrePions = [
      { zone: 'circuit', progression: 0 },
      { zone: 'circuit', progression: 0 },
      { zone: 'circuit', progression: 0 },
      { zone: 'circuit', progression: 0 },
    ];
    // Nord a des pions bien placés pour avancer, mais sud est au trait
    // avec un dé qui n'est pas un six : aucun de ses pions (tous à
    // l'enclos) ne peut jouer, peu importe l'état de nord.
    const etat = etatAvec(pionsSud, pionsNord, 4);
    expect(coupsLegaux(etat)).toEqual([]);
  });
});
