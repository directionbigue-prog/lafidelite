import { describe, expect, it } from 'vitest';
import { coupsLegaux, nourrit, semer, sommeCote } from './coups';
import type { Camp, EtatAwale } from './etat';

function etatAvec(
  trous: readonly number[],
  trait: Camp,
  greniers: Readonly<Record<Camp, number>> = { sud: 0, nord: 0 },
): EtatAwale {
  expect(trous).toHaveLength(12); // un test qui se trompe de longueur se trompe silencieusement sinon
  return { trous: [...trous], greniers, trait };
}

describe('semer — règle 1 : le trou de départ est sauté au tour complet', () => {
  it('un trou de douze graines finit à zéro, pas à une', () => {
    // 12 graines depuis le trou 0 : les onze trous suivants reçoivent
    // chacun une graine (1 à 11), et la douzième — qui referme le tour —
    // saute le trou 0 pour continuer sur le trou 1, qui en reçoit deux.
    const { trous, dernier } = semer([12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0);
    expect(trous[0]).toBe(0);
    expect(trous[1]).toBe(2);
    for (let trou = 2; trou <= 11; trou += 1) expect(trous[trou]).toBe(1);
    expect(dernier).toBe(1);
  });

  it("contre-épreuve : onze graines ne bouclent pas, le trou 0 reste vide sans qu'aucun saut ne soit nécessaire", () => {
    // Sans le saut, une implémentation naïve place la douzième graine sur
    // le trou de départ lui-même — ce test seul ne le distingue pas (11
    // graines ne rebouclent jamais), c'est le test précédent qui tranche.
    // Il sert de repère : le trou 0 vide ici n'est pas une coïncidence du
    // saut, mais le résultat normal de onze graines sur onze trous.
    const { trous, dernier } = semer([11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0);
    expect(trous[0]).toBe(0);
    for (let trou = 1; trou <= 11; trou += 1) expect(trous[trou]).toBe(1);
    expect(dernier).toBe(11);
  });

  it('un tour et demi (13 graines) redonne une deuxième graine au trou juste après le départ', () => {
    const { trous, dernier } = semer([13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0);
    expect(trous[0]).toBe(0);
    expect(trous[1]).toBe(2);
    expect(trous[2]).toBe(2);
    for (let trou = 3; trou <= 11; trou += 1) expect(trous[trou]).toBe(1);
    expect(dernier).toBe(2);
  });
});

describe('nourrit', () => {
  it('est vrai quand le semis atteint la rangée adverse', () => {
    // Trou 5 (sud) sème 2 graines : trous 6 et 7, tous deux chez nord.
    const trous = [0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0];
    expect(nourrit(trous, 5, 'nord')).toBe(true);
  });

  it('est faux quand le semis reste entièrement du côté du joueur', () => {
    // Trou 0 (sud) sème 1 graine : trou 1, encore chez sud.
    const trous = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(nourrit(trous, 0, 'nord')).toBe(false);
  });
});

describe("coupsLegaux — règle 4 : nourrir l'adversaire affamé est obligatoire", () => {
  it("ne restreint rien tant que l'adversaire a au moins une graine", () => {
    const etat = etatAvec([1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1], 'sud');
    // Nord a une graine (trou 11) : aucune restriction de nourrissage.
    expect(coupsLegaux(etat)).toEqual([0, 3]);
  });

  it("exclut les trous qui ne nourrissent pas quand l'adversaire est à zéro", () => {
    // Nord entièrement à zéro. Trou 0 sème 1 graine sur le trou 1 (sud) :
    // ne nourrit pas. Trou 3 sème 1 graine sur le trou 4 (sud) : ne
    // nourrit pas non plus. Trou 5 sème 2 graines sur 6 et 7 (nord) :
    // nourrit. Sans la restriction, les trois seraient légaux.
    const etat = etatAvec([1, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0], 'sud');
    expect(coupsLegaux(etat)).toEqual([5]);
  });

  it('rend un tableau vide quand aucun coup ne nourrit — la famine sans issue', () => {
    // Nord à zéro, et les deux seuls trous non vides de sud (0 et 3) ne
    // sèment que dans sa propre rangée : aucun coup ne nourrit.
    const etat = etatAvec([1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], 'sud');
    expect(coupsLegaux(etat)).toEqual([]);
  });

  it('ne propose jamais un trou vide ni un trou adverse', () => {
    // Trou 0 (sud) est vide : exclu. Trou 5 (sud) est vide aussi : exclu.
    // Trou 6 (nord, 5 graines) n'appartient pas à sud : exclu malgré sa
    // richesse. Seuls 1 et 4, non vides et à sud, restent.
    const etat = etatAvec([0, 3, 0, 0, 4, 0, 5, 0, 0, 0, 0, 0], 'sud');
    const legaux = coupsLegaux(etat);
    expect(legaux).toEqual([1, 4]);
    for (const trou of legaux) expect(trou).toBeLessThan(6);
  });
});

describe('sommeCote', () => {
  it('compte les douze graines de départ par moitié de six', () => {
    const trous = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
    expect(sommeCote(trous, 'sud')).toBe(24);
    expect(sommeCote(trous, 'nord')).toBe(24);
  });
});
