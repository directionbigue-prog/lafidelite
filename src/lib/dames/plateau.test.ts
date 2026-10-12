import { describe, expect, it } from 'vitest';
import {
  coordonnees,
  numeroCase,
  voisine,
  sensAvance,
  rangeePromotion,
  NB_CASES,
  DIRECTIONS,
} from './plateau';

describe('numérotation officielle des 50 cases jouables', () => {
  it('place la case 1 en haut à gauche, sur la première case sombre', () => {
    expect(coordonnees(1)).toEqual({ rangee: 0, colonne: 1 });
  });

  it('place la case 50 en bas à droite', () => {
    expect(coordonnees(50)).toEqual({ rangee: 9, colonne: 8 });
  });

  it("fait l'aller-retour case → coordonnées → case sur les 50 cases", () => {
    for (let n = 1; n <= NB_CASES; n += 1) {
      const { rangee, colonne } = coordonnees(n);
      expect(numeroCase(rangee, colonne)).toBe(n);
    }
  });

  it('refuse les cases claires, qui ne sont jamais jouables', () => {
    // Rangée 0 : les cases jouables sont en colonnes impaires.
    expect(numeroCase(0, 0)).toBeNull();
    // Rangée 1 : elles sont en colonnes paires.
    expect(numeroCase(1, 1)).toBeNull();
  });

  it('refuse tout ce qui sort du damier', () => {
    expect(numeroCase(-1, 1)).toBeNull();
    expect(numeroCase(10, 1)).toBeNull();
    expect(numeroCase(0, 11)).toBeNull();
  });
});

describe('voisinage diagonal', () => {
  // Valeur de référence : depuis la case 1, les deux seules cases
  // atteignables en descendant sont 6 et 7. C'est la première ligne de
  // toutes les tables publiées, et elle vérifie la formule d'un coup.
  it('relie la case 1 aux cases 6 et 7 en descendant', () => {
    const descendantes = DIRECTIONS.filter((d) => d.dr === 1)
      .map((d) => voisine(1, d))
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    expect(descendantes).toEqual([6, 7]);
  });

  it("n'a aucune voisine hors du damier depuis un bord", () => {
    // La case 5 est au bord droit de la rangée 0 : pas de voisine à droite,
    // et rien au-dessus.
    expect(voisine(5, { dr: 1, dc: 1 })).toBeNull();
    expect(voisine(5, { dr: -1, dc: -1 })).toBeNull();
  });

  it('glisse sur plusieurs cases dans la même direction', () => {
    // 1 → 7 → 12 : la même diagonale, distance 1 puis 2.
    expect(voisine(1, { dr: 1, dc: 1 })).toBe(7);
    expect(voisine(1, { dr: 1, dc: 1 }, 2)).toBe(12);
  });

  it('propose exactement les quatre diagonales', () => {
    expect(DIRECTIONS).toHaveLength(4);
  });
});

describe('sens de jeu', () => {
  // Les noirs occupent les cases 1-20 et descendent ; les blancs occupent
  // 31-50 et montent. C'est le standard, et les blancs ouvrent.
  it('fait descendre les noirs et monter les blancs', () => {
    expect(sensAvance('noir')).toBe(1);
    expect(sensAvance('blanc')).toBe(-1);
  });

  it('promeut chaque camp sur la rangée du fond adverse', () => {
    expect(rangeePromotion('blanc')).toBe(0);
    expect(rangeePromotion('noir')).toBe(9);
  });
});
