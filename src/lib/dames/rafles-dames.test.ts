import { describe, expect, it } from 'vitest';
import { raflesBrutes } from './coups';
import { plateauVide, type Case, type EtatPlateau } from './etat';

function etatAvec(
  placements: readonly [caseNum: number, camp: 'blanc' | 'noir', dame?: boolean][],
  trait: 'blanc' | 'noir',
): EtatPlateau {
  const cases: Case[] = plateauVide();
  for (const [caseNum, camp, dame = false] of placements) {
    cases[caseNum - 1] = { camp, dame };
  }
  return { cases, trait };
}

describe('prise par une dame volante', () => {
  it('prend une pièce éloignée sur sa diagonale', () => {
    // Dame blanche en 46, pion noir en 28 : entre les deux, 41 et 37 sont
    // libres, donc la prise est possible malgré la distance.
    const rafles = raflesBrutes(
      etatAvec(
        [
          [46, 'blanc', true],
          [28, 'noir'],
        ],
        'blanc',
      ),
    );
    expect(rafles.length).toBeGreaterThan(0);
    expect(rafles.every((r) => r.captures.length === 1 && r.captures[0] === 28)).toBe(true);
  });

  it('propose toutes les cases libres derrière la pièce prise', () => {
    // La diagonale montante depuis 46 est 41, 37, 32, 28, 23, 19, 14, 10, 5.
    // Après avoir sauté 28, tout ce qui suit est un atterrissage possible.
    const arrivees = raflesBrutes(
      etatAvec(
        [
          [46, 'blanc', true],
          [28, 'noir'],
        ],
        'blanc',
      ),
    )
      .map((r) => r.arrivee)
      .sort((a, b) => a - b);
    expect(arrivees).toEqual([5, 10, 14, 19, 23]);
  });

  it("s'arrête sur la première case occupée derrière la pièce prise", () => {
    // Un pion blanc en 19 borne la diagonale : seule la case 23 reste. Il
    // est du même camp délibérément — une pièce noire en 19 serait une
    // seconde prise, et la rafle continuerait au lieu de s'arrêter.
    const rafles = raflesBrutes(
      etatAvec(
        [
          [46, 'blanc', true],
          [28, 'noir'],
          [19, 'blanc'],
        ],
        'blanc',
      ),
    );
    expect(rafles.map((r) => r.arrivee)).toEqual([23]);
  });

  it('ne franchit jamais deux pièces à la suite', () => {
    // 37 et 32 sont adjacentes sur la diagonale : rien à prendre.
    expect(
      raflesBrutes(
        etatAvec(
          [
            [46, 'blanc', true],
            [41, 'noir'],
            [37, 'noir'],
          ],
          'blanc',
        ),
      ),
    ).toEqual([]);
  });

  it('ne franchit jamais une pièce de son propre camp', () => {
    expect(
      raflesBrutes(
        etatAvec(
          [
            [46, 'blanc', true],
            [28, 'blanc'],
          ],
          'blanc',
        ),
      ),
    ).toEqual([]);
  });

  it('ne repasse jamais par-dessus une pièce déjà prise dans la rafle', () => {
    for (const rafle of raflesBrutes(
      etatAvec(
        [
          [46, 'blanc', true],
          [28, 'noir'],
          [13, 'noir'],
          [22, 'noir'],
        ],
        'blanc',
      ),
    )) {
      expect(new Set(rafle.captures).size).toBe(rafle.captures.length);
    }
  });
});

describe('atterrissages et continuations', () => {
  it('ouvre des continuations différentes selon la case d’atterrissage', () => {
    // Le point de la dame volante : après une prise, où l'on se pose
    // décide de ce qu'on peut prendre ensuite. Le générateur doit donc
    // brancher sur chaque atterrissage, pas seulement sur la victime.
    const rafles = raflesBrutes(
      etatAvec(
        [
          [46, 'blanc', true],
          [28, 'noir'],
          [12, 'noir'],
        ],
        'blanc',
      ),
    );
    const longueurs = new Set(rafles.map((r) => r.captures.length));
    expect(longueurs.has(1)).toBe(true);
    expect(longueurs.has(2)).toBe(true);
  });
});
