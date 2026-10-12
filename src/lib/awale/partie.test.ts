import { describe, expect, it } from 'vitest';
import { appliquer, issue } from './partie';
import { grainesEn, type Camp, type EtatAwale } from './etat';

function etatAvec(
  trous: readonly number[],
  trait: Camp,
  greniers: Readonly<Record<Camp, number>> = { sud: 0, nord: 0 },
): EtatAwale {
  expect(trous).toHaveLength(12);
  return { trous: [...trous], greniers, trait };
}

describe('appliquer — semis', () => {
  it("vide le trou de départ et sème dans le sens de l'anneau", () => {
    const etat = etatAvec([3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'sud');
    const apres = appliquer(etat, 0);
    expect(grainesEn(apres.trous, 0)).toBe(0);
    expect(grainesEn(apres.trous, 1)).toBe(1);
    expect(grainesEn(apres.trous, 2)).toBe(1);
    expect(grainesEn(apres.trous, 3)).toBe(1);
    expect(apres.trait).toBe('nord');
  });

  it("ne modifie jamais l'état reçu", () => {
    const etat = etatAvec([3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'sud');
    appliquer(etat, 0);
    expect(grainesEn(etat.trous, 0)).toBe(3);
  });

  it('refuse de jouer un trou vide', () => {
    const etat = etatAvec([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'sud');
    expect(() => appliquer(etat, 0)).toThrow();
  });

  it('refuse de jouer un trou adverse', () => {
    const etat = etatAvec([0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0], 'sud');
    expect(() => appliquer(etat, 6)).toThrow();
  });
});

describe("appliquer — règle 2 : la prise remonte et s'arrête au premier échec", () => {
  it("capture le dernier trou puis s'arrête dès que le précédent ne fait pas deux ou trois — sans aller vérifier plus loin", () => {
    // Sud joue le trou 5 (3 graines) : elles tombent sur 6, 7, 8.
    // Avant semis : 6 a 1 (→2, prenable), 7 a 0 (→1, PAS prenable), 8 a 2
    // (→3, prenable, dernier trou atteint).
    // La remontée part de 8 (pris), passe à 7 : 1 graine, échoue, s'arrête.
    // Le trou 6 — pourtant à deux graines — n'est jamais examiné : une
    // implémentation qui « saute » les trous en échec au lieu de s'arrêter
    // le prendrait aussi, à tort.
    const etat = etatAvec([0, 0, 0, 0, 0, 3, 1, 0, 2, 0, 0, 0], 'sud');
    const apres = appliquer(etat, 5);
    expect(grainesEn(apres.trous, 8)).toBe(0); // pris
    expect(grainesEn(apres.trous, 7)).toBe(1); // épargné : à un, jamais pris
    expect(grainesEn(apres.trous, 6)).toBe(2); // épargné : jamais atteint par la remontée
    expect(apres.greniers.sud).toBe(3); // seul le trou 8 (3 graines) est pris
    expect(apres.greniers.nord).toBe(0);
  });

  it('ne prend rien quand la dernière graine tombe chez soi', () => {
    // Sud joue le trou 3 (1 graine) : elle tombe sur le trou 4, chez sud.
    // Aucune prise n'est même tentée, quelle que soit sa valeur finale.
    const etat = etatAvec([0, 0, 0, 1, 2, 0, 0, 0, 0, 0, 0, 0], 'sud');
    const apres = appliquer(etat, 3);
    expect(grainesEn(apres.trous, 4)).toBe(3); // 2 + 1 semée, non prise
    expect(apres.greniers.sud).toBe(0);
  });

  it('ne prend pas un trou adverse à un ou à quatre graines ou plus', () => {
    const etat = etatAvec([0, 0, 0, 0, 0, 1, 3, 0, 0, 0, 0, 0], 'sud');
    // Trou 5 (1 graine) tombe sur le trou 6 : 3 + 1 = 4, pas pris.
    const apres = appliquer(etat, 5);
    expect(grainesEn(apres.trous, 6)).toBe(4);
    expect(apres.greniers.sud).toBe(0);
  });
});

describe("appliquer — règle 2 (suite) : la remontée s'arrête aussi en quittant la rangée adverse", () => {
  it('ne capture jamais un trou du camp qui joue, même tentant, une fois la rangée adverse épuisée', () => {
    // Sud joue le trou 4 (7 graines) : elles tombent sur 5, puis 6..11.
    // Les six trous de nord sont réglés pour finir chacun à deux ou trois :
    // la remontée les prend TOUS (règle 3 : une prise qui vide entièrement
    // l'adversaire est autorisée et compte pleinement — ce n'est PAS
    // Abapa, qui annulerait la prise). Le trou 5 — à sud, pas à nord —
    // finit lui aussi à deux graines après le semis : un numéro
    // numériquement identique à ceux qui viennent d'être pris, posé juste
    // avant eux dans le sens de la remontée. Une implémentation qui ne
    // vérifierait que le compte (2 ou 3), sans vérifier la rangée, le
    // capturerait aussi — à tort, puisqu'il appartient à sud lui-même.
    const etat = etatAvec([0, 0, 0, 0, 7, 1, 1, 1, 2, 1, 1, 1], 'sud');
    const apres = appliquer(etat, 4);
    expect(grainesEn(apres.trous, 6)).toBe(0);
    expect(grainesEn(apres.trous, 7)).toBe(0);
    expect(grainesEn(apres.trous, 8)).toBe(0);
    expect(grainesEn(apres.trous, 9)).toBe(0);
    expect(grainesEn(apres.trous, 10)).toBe(0);
    expect(grainesEn(apres.trous, 11)).toBe(0);
    expect(grainesEn(apres.trous, 5)).toBe(2); // épargné : trou de sud, jamais adverse
    expect(apres.greniers.sud).toBe(2 + 2 + 2 + 3 + 2 + 2); // 13, les six trous de nord
    expect(apres.greniers.nord).toBe(0);
  });
});

describe('issue — les seuils qui tranchent immédiatement', () => {
  it('déclare sud vainqueur dès vingt-cinq graines, même si des coups restent jouables', () => {
    const etat = etatAvec([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4], 'sud', { sud: 25, nord: 0 });
    // Vingt-cinq est déjà la majorité absolue de 48 : la partie est jugée,
    // qu'il reste ou non des coups — `issue` ne doit même pas les regarder.
    expect(issue(etat)).toEqual({ fini: true, vainqueur: 'sud' });
  });

  it('déclare nord vainqueur dès vingt-cinq graines', () => {
    const etat = etatAvec([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'sud', { sud: 20, nord: 25 });
    expect(issue(etat)).toEqual({ fini: true, vainqueur: 'nord' });
  });

  it('déclare un match nul à vingt-quatre partout', () => {
    const etat = etatAvec([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'sud', { sud: 24, nord: 24 });
    expect(issue(etat)).toEqual({ fini: true, vainqueur: null });
  });

  it("ne déclare rien tant qu'un coup légal existe et qu'aucun seuil n'est atteint", () => {
    const etat = etatAvec([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4], 'sud');
    expect(issue(etat)).toEqual({ fini: false });
  });
});

describe('issue — règle 4 (suite) : la famine sans issue déclenche la récolte', () => {
  it("fait gagner le joueur au trait qui récolte ses propres graines, l'adversaire déjà affamé", () => {
    // Nord à zéro. Les deux seuls trous non vides de sud (0 et 3, une
    // graine chacun) ne sèment que dans sa propre rangée : aucun coup ne
    // nourrit, `coupsLegaux` est vide. Sud récolte ses 2 graines restantes :
    // 10 + 2 = 12 contre 5 pour nord, qui n'en gagne aucune.
    const etat = etatAvec([1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], 'sud', { sud: 10, nord: 5 });
    expect(issue(etat)).toEqual({ fini: true, vainqueur: 'sud' });
  });

  it('rend un match nul quand la récolte égalise les deux greniers', () => {
    // Même position bloquée (2 graines chez sud, 0 chez nord), mais des
    // greniers choisis pour qu'après récolte les deux camps se retrouvent
    // à vingt-quatre : 22 + 2 = 24 côté sud, 24 + 0 = 24 côté nord.
    const etat = etatAvec([1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], 'sud', { sud: 22, nord: 24 });
    expect(issue(etat)).toEqual({ fini: true, vainqueur: null });
  });

  it("ne déclare pas la famine tant qu'un coup nourrissant existe", () => {
    // Nord à zéro, mais le trou 5 (2 graines) sème sur 6 et 7 : ce coup
    // nourrit, `coupsLegaux` n'est pas vide, la partie continue.
    const etat = etatAvec([1, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0], 'sud');
    expect(issue(etat)).toEqual({ fini: false });
  });
});
