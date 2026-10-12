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

describe('prise simple par un pion', () => {
  it('saute une pièce adverse et atterrit juste derrière', () => {
    // Blanc en 33 ; noir en 28 ; la case 22 est libre.
    const rafles = raflesBrutes(
      etatAvec(
        [
          [33, 'blanc'],
          [28, 'noir'],
        ],
        'blanc',
      ),
    );
    expect(rafles).toHaveLength(1);
    expect(rafles[0]).toMatchObject({ depart: 33, arrivee: 22, captures: [28] });
  });

  it('prend aussi en arrière', () => {
    // Le pion blanc en 28 monte normalement ; ici la prise est vers le bas.
    const rafles = raflesBrutes(
      etatAvec(
        [
          [28, 'blanc'],
          [33, 'noir'],
        ],
        'blanc',
      ),
    );
    expect(rafles.map((r) => r.arrivee)).toEqual([39]);
  });

  it('ne saute pas si la case derrière est occupée', () => {
    expect(
      raflesBrutes(
        etatAvec(
          [
            [33, 'blanc'],
            [28, 'noir'],
            [22, 'noir'],
          ],
          'blanc',
        ),
      ),
    ).toEqual([]);
  });

  it('ne saute jamais une pièce de son propre camp', () => {
    expect(
      raflesBrutes(
        etatAvec(
          [
            [33, 'blanc'],
            [28, 'blanc'],
          ],
          'blanc',
        ),
      ),
    ).toEqual([]);
  });
});

describe('rafles enchaînées', () => {
  it('enchaîne deux prises et garde le palier intermédiaire', () => {
    // 33 saute 28 (atterrit 22), puis saute 17 (atterrit 11).
    const rafles = raflesBrutes(
      etatAvec(
        [
          [33, 'blanc'],
          [28, 'noir'],
          [17, 'noir'],
        ],
        'blanc',
      ),
    );
    const deux = rafles.filter((r) => r.captures.length === 2);
    expect(deux).toHaveLength(1);
    expect(deux[0]).toMatchObject({ depart: 33, arrivee: 11, paliers: [22] });
    expect([...(deux[0]?.captures ?? [])].sort((a, b) => a - b)).toEqual([17, 28]);
  });

  it('ne saute jamais deux fois la même pièce', () => {
    // Une pièce déjà prise reste sur le plateau et bloque : aucune rafle ne
    // peut donc compter deux fois la même case.
    for (const rafle of raflesBrutes(
      etatAvec(
        [
          [33, 'blanc'],
          [28, 'noir'],
          [17, 'noir'],
          [16, 'noir'],
        ],
        'blanc',
      ),
    )) {
      expect(new Set(rafle.captures).size).toBe(rafle.captures.length);
    }
  });
});

describe('rafle traversant la rangée de promotion', () => {
  it('repart de la rangée du fond sans changer de nature', () => {
    // Le pion blanc en 13 saute 8, se pose en 2 — sur la rangée 0, celle
    // de sa promotion — puis repart en arrière sauter 7 et finit en 11.
    //
    // Un pion ne peut atteindre la rangée du fond qu'en s'y posant : le
    // saut suivant devrait sortir du damier. La seule continuation possible
    // est donc un retour en arrière, et c'est exactement ce cas qui
    // distingue « promu en vol » de « promu à l'arrivée ». Que la rafle
    // existe suffit ici ; que la pièce ne soit PAS une dame au bout est
    // vérifié par `appliquer` (Task 6), seul responsable de la promotion.
    const rafles = raflesBrutes(
      etatAvec(
        [
          [13, 'blanc'],
          [8, 'noir'],
          [7, 'noir'],
        ],
        'blanc',
      ),
    );
    expect(rafles).toHaveLength(1);
    expect(rafles[0]).toMatchObject({ depart: 13, arrivee: 11, paliers: [2] });
    expect([...(rafles[0]?.captures ?? [])].sort((a, b) => a - b)).toEqual([7, 8]);
  });
});

describe('trait', () => {
  it("ne génère aucune rafle pour le camp qui n'est pas au trait", () => {
    // Noir en 28 a une unique direction adverse (33), mais son atterrissage
    // (39) est occupé par l'autre pièce noire : bloqué. Noir en 39 a une
    // unique direction adverse (33 aussi), mais son atterrissage (28) est
    // occupé par l'autre pièce noire : bloqué également. Donc même en
    // traitant les deux pièces noires (celles du trait), le résultat est
    // vide — ce n'est pas parce qu'aucune pièce noire n'existe.
    //
    // Blanc en 33, lui, a une prise géométriquement valide (33 prend 28,
    // atterrissage 22 libre — et aussi 33 prend 39, atterrissage 44 libre) :
    // si le filtre de trait disparaissait, la boucle traiterait aussi cette
    // pièce et le résultat cesserait d'être []. C'est ce contraste qui
    // donne au test un pouvoir de détection réel sur le filtre de trait, à
    // la différence d'une position où aucune pièce adverse n'existe.
    expect(
      raflesBrutes(
        etatAvec(
          [
            [33, 'blanc'],
            [28, 'noir'],
            [39, 'noir'],
          ],
          'noir',
        ),
      ),
    ).toEqual([]);
  });
});
