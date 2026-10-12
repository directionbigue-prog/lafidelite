import { describe, expect, it } from 'vitest';
import type { EtatLudo, QuatrePions } from './etat';
import { appliquer, issue, lancerDe, passerLaMain, valeurDe } from './partie';

const QUATRE_ENCLOS: QuatrePions = [
  { zone: 'enclos' },
  { zone: 'enclos' },
  { zone: 'enclos' },
  { zone: 'enclos' },
];

function etatAvec(partiel: {
  sud?: QuatrePions;
  nord?: QuatrePions;
  trait?: 'sud' | 'nord';
  de?: number | null;
  sixDAffilee?: number;
}): EtatLudo {
  return {
    pions: { sud: partiel.sud ?? QUATRE_ENCLOS, nord: partiel.nord ?? QUATRE_ENCLOS },
    trait: partiel.trait ?? 'sud',
    de: partiel.de ?? null,
    sixDAffilee: partiel.sixDAffilee ?? 0,
  };
}

describe('valeurDe — correspondance entre le flottant [0,1) et la face 1-6', () => {
  it('couvre les six faces sur les six sixièmes de l’intervalle', () => {
    expect(valeurDe(() => 0)).toBe(1);
    expect(valeurDe(() => 1 / 6)).toBe(2);
    expect(valeurDe(() => 2 / 6)).toBe(3);
    expect(valeurDe(() => 3 / 6)).toBe(4);
    expect(valeurDe(() => 4 / 6)).toBe(5);
    expect(valeurDe(() => 5 / 6)).toBe(6);
    expect(valeurDe(() => 0.999999)).toBe(6);
  });
});

describe('lancerDe', () => {
  it('lève si un dé est déjà en attente — on ne relance jamais sans avoir joué', () => {
    const etat = etatAvec({ de: 4 });
    expect(() => lancerDe(etat, () => 0)).toThrow();
  });

  it('un dé différent de six pose le dé et remet le compteur de six à zéro', () => {
    const etat = etatAvec({ sixDAffilee: 0 });
    const suivant = lancerDe(etat, () => 0); // -> 1
    expect(suivant.de).toBe(1);
    expect(suivant.trait).toBe('sud');
    expect(suivant.sixDAffilee).toBe(0);
  });

  it('un six pose le dé à 6 et incrémente le compteur, sans changer le trait', () => {
    const etat = etatAvec({ sixDAffilee: 0 });
    const suivant = lancerDe(etat, () => 0.99); // -> 6
    expect(suivant.de).toBe(6);
    expect(suivant.trait).toBe('sud');
    expect(suivant.sixDAffilee).toBe(1);
  });

  it('deux six d’affilée : le compteur monte à 2, le dé reste jouable', () => {
    const etat = etatAvec({ sixDAffilee: 1 });
    const suivant = lancerDe(etat, () => 0.99);
    expect(suivant.de).toBe(6);
    expect(suivant.sixDAffilee).toBe(2);
    expect(suivant.trait).toBe('sud');
  });

  it('règle délicate n°3 : le TROISIÈME six d’affilée annule le tour sans être joué', () => {
    const etat = etatAvec({ trait: 'sud', sixDAffilee: 2 });
    const suivant = lancerDe(etat, () => 0.99); // -> 6, mais c'est le 3e
    expect(suivant.de).toBeNull(); // le 3e six n'est jamais posé comme dé jouable
    expect(suivant.trait).toBe('nord'); // la main passe immédiatement
    expect(suivant.sixDAffilee).toBe(0); // le compteur repart de zéro pour le camp suivant
  });
});

describe('passerLaMain', () => {
  it('règle délicate n°4 (progression) : passe le trait sans toucher au plateau', () => {
    const pionsSud: QuatrePions = [
      { zone: 'circuit', progression: 7 },
      { zone: 'enclos' },
      { zone: 'enclos' },
      { zone: 'enclos' },
    ];
    const etat = etatAvec({ sud: pionsSud, trait: 'sud', de: 3, sixDAffilee: 1 });
    const suivant = passerLaMain(etat);
    expect(suivant.trait).toBe('nord');
    expect(suivant.de).toBeNull();
    expect(suivant.sixDAffilee).toBe(0);
    expect(suivant.pions).toEqual(etat.pions); // le plateau ne bouge pas, seul le trait change
  });
});

describe('appliquer — sortie d’enclos', () => {
  it('un six fait sortir un pion sur sa propre entrée et fait rejouer le même camp', () => {
    const etat = etatAvec({ trait: 'sud', de: 6, sixDAffilee: 1 });
    const suivant = appliquer(etat, 0);
    expect(suivant.pions.sud[0]).toEqual({ zone: 'circuit', progression: 0 });
    expect(suivant.trait).toBe('sud'); // un six rejoue
    expect(suivant.de).toBeNull(); // il faut relancer
    expect(suivant.sixDAffilee).toBe(1); // laissé tel quel — lancerDe l'a déjà posé
  });
});

describe('appliquer — un coup normal passe la main', () => {
  it('un dé différent de six déplace le pion et passe le trait à l’adversaire', () => {
    const pionsSud: QuatrePions = [
      { zone: 'circuit', progression: 10 },
      { zone: 'enclos' },
      { zone: 'enclos' },
      { zone: 'enclos' },
    ];
    const etat = etatAvec({ sud: pionsSud, trait: 'sud', de: 4, sixDAffilee: 2 });
    const suivant = appliquer(etat, 0);
    expect(suivant.pions.sud[0]).toEqual({ zone: 'circuit', progression: 14 });
    expect(suivant.trait).toBe('nord');
    expect(suivant.de).toBeNull();
    // Remis à zéro même si la valeur d'entrée était non nulle : un coup
    // joué avec un dé non-six clôt toujours le cycle de six en cours.
    expect(suivant.sixDAffilee).toBe(0);
  });
});

describe('appliquer — règle délicate n°2 : la case sûre où l’on ne prend jamais', () => {
  it('capture un pion adverse trouvé sur une case ordinaire', () => {
    // sud : progression 2 -> +3 = progression 5 -> case absolue 5 (ni 0 ni 26 : pas sûre).
    // nord : progression 31 -> case absolue (26+31)%52 = 5, la même case.
    const pionsSud: QuatrePions = [
      { zone: 'circuit', progression: 2 },
      { zone: 'enclos' },
      { zone: 'enclos' },
      { zone: 'enclos' },
    ];
    const pionsNord: QuatrePions = [
      { zone: 'circuit', progression: 31 },
      { zone: 'enclos' },
      { zone: 'enclos' },
      { zone: 'enclos' },
    ];
    const etat = etatAvec({ sud: pionsSud, nord: pionsNord, trait: 'sud', de: 3 });
    const suivant = appliquer(etat, 0);
    expect(suivant.pions.sud[0]).toEqual({ zone: 'circuit', progression: 5 });
    expect(suivant.pions.nord[0]).toEqual({ zone: 'enclos' }); // repris
  });

  it("ne capture PAS un pion adverse posté sur une case d'entrée — la case sûre", () => {
    // sud : progression 23 -> +3 = progression 26 -> case absolue 26, l'entrée de nord : sûre.
    // nord : progression 0 -> case absolue (26+0)%52 = 26, la même case, mais sûre.
    const pionsSud: QuatrePions = [
      { zone: 'circuit', progression: 23 },
      { zone: 'enclos' },
      { zone: 'enclos' },
      { zone: 'enclos' },
    ];
    const pionsNord: QuatrePions = [
      { zone: 'circuit', progression: 0 },
      { zone: 'enclos' },
      { zone: 'enclos' },
      { zone: 'enclos' },
    ];
    const etat = etatAvec({ sud: pionsSud, nord: pionsNord, trait: 'sud', de: 3 });
    const suivant = appliquer(etat, 0);
    expect(suivant.pions.sud[0]).toEqual({ zone: 'circuit', progression: 26 });
    // La case est sûre : le pion de nord reste exactement où il était.
    expect(suivant.pions.nord[0]).toEqual({ zone: 'circuit', progression: 0 });
  });

  it('ne touche jamais un pion adverse en colonne ou déjà arrivé, même à progression numériquement égale', () => {
    const pionsSud: QuatrePions = [
      { zone: 'circuit', progression: 2 },
      { zone: 'enclos' },
      { zone: 'enclos' },
      { zone: 'enclos' },
    ];
    const pionsNord: QuatrePions = [
      { zone: 'colonne', progression: 3 }, // hors circuit : jamais candidat à la prise
      { zone: 'arrivee' },
      { zone: 'enclos' },
      { zone: 'enclos' },
    ];
    const etat = etatAvec({ sud: pionsSud, nord: pionsNord, trait: 'sud', de: 3 });
    const suivant = appliquer(etat, 0);
    expect(suivant.pions.nord).toEqual(pionsNord); // rien n'a bougé côté nord
  });
});

describe('appliquer — règle délicate n°1 (contrôle) : le score exact pour arriver', () => {
  it('un pion en colonne avec le score exact devient "arrivee"', () => {
    const pionsSud: QuatrePions = [
      { zone: 'colonne', progression: 3 },
      { zone: 'enclos' },
      { zone: 'enclos' },
      { zone: 'enclos' },
    ];
    const etat = etatAvec({ sud: pionsSud, trait: 'sud', de: 2 });
    const suivant = appliquer(etat, 0);
    expect(suivant.pions.sud[0]).toEqual({ zone: 'arrivee' });
  });
});

describe('appliquer — garde-fous', () => {
  it('lève si aucun dé n’est en attente', () => {
    const etat = etatAvec({ de: null });
    expect(() => appliquer(etat, 0)).toThrow();
  });

  it('lève si le pion désigné ne peut pas jouer ce dé (ex : sortir sans six)', () => {
    const etat = etatAvec({ de: 5 });
    expect(() => appliquer(etat, 0)).toThrow();
  });
});

describe('issue', () => {
  it("n'est pas finie tant que les quatre pions d'un camp ne sont pas tous arrivés", () => {
    const pionsSud: QuatrePions = [
      { zone: 'arrivee' },
      { zone: 'arrivee' },
      { zone: 'arrivee' },
      { zone: 'circuit', progression: 40 },
    ];
    const etat = etatAvec({ sud: pionsSud });
    expect(issue(etat)).toEqual({ fini: false });
  });

  it('déclare le camp vainqueur dès que ses quatre pions sont arrivés', () => {
    const pionsNord: QuatrePions = [
      { zone: 'arrivee' },
      { zone: 'arrivee' },
      { zone: 'arrivee' },
      { zone: 'arrivee' },
    ];
    const etat = etatAvec({ nord: pionsNord });
    expect(issue(etat)).toEqual({ fini: true, vainqueur: 'nord' });
  });
});
