import { describe, expect, it } from 'vitest';
import { coupsLegaux } from './coups';
import { positionDepart, plateauVide, type Case, type EtatPlateau } from './etat';

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

describe('la prise est obligatoire', () => {
  it('supprime tous les déplacements simples dès qu’une prise existe', () => {
    // Le pion blanc en 33 peut avancer en 29 ; il peut aussi prendre en 28.
    // La prise étant obligatoire, avancer n'est plus légal.
    const coups = coupsLegaux(
      etatAvec(
        [
          [33, 'blanc'],
          [28, 'noir'],
          [50, 'blanc'],
        ],
        'blanc',
      ),
    );
    expect(coups.every((c) => c.captures.length > 0)).toBe(true);
  });

  it('rend les déplacements simples quand aucune prise n’existe', () => {
    expect(coupsLegaux(positionDepart())).toHaveLength(9);
  });
});

describe('rafle maximale', () => {
  // Position à deux branches inégales depuis la case 33 :
  //   - vers le haut : 33 saute 28 (palier 22) puis 17, et finit en 11 → 2 prises ;
  //   - vers le bas  : 33 saute 39 et finit en 44, sans suite → 1 prise.
  // Seule la première est légale.
  const DEUX_BRANCHES: readonly [number, 'blanc' | 'noir', boolean?][] = [
    [33, 'blanc'],
    [28, 'noir'],
    [17, 'noir'],
    [39, 'noir'],
  ];

  it('ne garde que les rafles les plus longues', () => {
    const coups = coupsLegaux(etatAvec(DEUX_BRANCHES, 'blanc'));
    expect(coups).toHaveLength(1);
    expect(coups[0]).toMatchObject({ depart: 33, arrivee: 11 });
    expect(coups[0]?.captures).toHaveLength(2);
  });

  it('compte les pièces, pas leur valeur : une dame ne vaut pas plus qu’un pion', () => {
    // La même position, sauf que la prise unique est celle d'une DAME.
    // Deux pions l'emportent quand même : la règle internationale compte
    // les pièces. (La variante italienne dit l'inverse — s'en inspirer ici
    // serait un bug silencieux, d'où ce test.)
    const coups = coupsLegaux(
      etatAvec(
        [
          [33, 'blanc'],
          [28, 'noir'],
          [17, 'noir'],
          [39, 'noir', true],
        ],
        'blanc',
      ),
    );
    expect(coups).toHaveLength(1);
    expect(coups[0]?.captures).toHaveLength(2);
  });
});

describe('déduplication des rafles', () => {
  // Position trouvée par recherche exhaustive (voir le rapport de la tâche
  // 6) : la disposition symétrique « dame au centre, quatre pions à
  // prendre » suggérée initialement (28 + 17/19/39/37) ne produit AUCUN
  // doublon brut — chaque ordre de prise y mène à une arrivée différente.
  // Celle-ci, en revanche, referme une rafle circulaire : la dame prend les
  // quatre pions dans un ordre (7 puis 8 puis 17 puis 23) ou dans l'ordre
  // inverse des deux derniers (7 puis 8 puis 23 puis 17), et les deux
  // chemins reviennent se poser sur la case de départ, 28, avec le même
  // ensemble de 4 prises. Sans dédup, `coupsLegaux` proposerait deux fois
  // le même coup vers 28.
  it('ne propose jamais deux coups de même départ, arrivée et prises', () => {
    const coups = coupsLegaux(
      etatAvec(
        [
          [28, 'blanc', true],
          [7, 'noir'],
          [8, 'noir'],
          [17, 'noir'],
          [23, 'noir'],
        ],
        'blanc',
      ),
    );
    expect(coups.length).toBeGreaterThan(0);
    const cles = coups.map(
      (c) => `${c.depart}-${c.arrivee}-${[...c.captures].sort((a, b) => a - b).join(',')}`,
    );
    expect(new Set(cles).size).toBe(cles.length);
  });
});
