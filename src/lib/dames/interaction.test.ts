import { describe, expect, it } from 'vitest';
import { toucher, jouables, destinations, INTERACTION_VIDE } from './interaction';
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

describe('sélection', () => {
  it('ne propose que les pièces qui ont un coup', () => {
    // Position de départ : seules les cases 31-35 peuvent bouger.
    expect(jouables(positionDepart(), INTERACTION_VIDE).sort((a, b) => a - b)).toEqual([
      31, 32, 33, 34, 35,
    ]);
  });

  it('sélectionne une pièce et propose ses destinations', () => {
    const reaction = toucher(positionDepart(), INTERACTION_VIDE, 33);
    expect(reaction.type).toBe('selection');
    if (reaction.type !== 'selection') return;
    expect(destinations(positionDepart(), reaction.interaction).sort((a, b) => a - b)).toEqual([
      28, 29,
    ]);
  });

  it('désélectionne quand on retouche la même pièce', () => {
    const premier = toucher(positionDepart(), INTERACTION_VIDE, 33);
    if (premier.type !== 'selection') throw new Error('sélection attendue');
    const second = toucher(positionDepart(), premier.interaction, 33);
    expect(second).toEqual({ type: 'selection', interaction: INTERACTION_VIDE });
  });
});

describe('la prise obligatoire est expliquée, pas subie', () => {
  it('refuse avec un message une pièce sans coup alors qu’une prise existe', () => {
    // Le pion en 50 pourrait avancer, mais celui en 33 doit prendre.
    const etat = etatAvec(
      [
        [33, 'blanc'],
        [28, 'noir'],
        [50, 'blanc'],
      ],
      'blanc',
    );
    const reaction = toucher(etat, INTERACTION_VIDE, 50);
    expect(reaction.type).toBe('refus');
    if (reaction.type !== 'refus') return;
    expect(reaction.message).toMatch(/prise est obligatoire/i);
  });

  it('ignore silencieusement une case vide ou adverse', () => {
    expect(toucher(positionDepart(), INTERACTION_VIDE, 25).type).toBe('rien');
    expect(toucher(positionDepart(), INTERACTION_VIDE, 1).type).toBe('rien');
  });
});

describe('jouer un coup', () => {
  it('rend le coup complet quand on touche une destination', () => {
    const selection = toucher(positionDepart(), INTERACTION_VIDE, 33);
    if (selection.type !== 'selection') throw new Error('sélection attendue');
    const reaction = toucher(positionDepart(), selection.interaction, 28);
    expect(reaction.type).toBe('coup');
    if (reaction.type !== 'coup') return;
    expect(reaction.coup).toMatchObject({ depart: 33, arrivee: 28, captures: [] });
  });
});

describe('rafles à plusieurs sauts', () => {
  const etat = etatAvec(
    [
      [33, 'blanc'],
      [28, 'noir'],
      [17, 'noir'],
    ],
    'blanc',
  );

  it('n’offre que le premier palier au premier toucher', () => {
    const selection = toucher(etat, INTERACTION_VIDE, 33);
    if (selection.type !== 'selection') throw new Error('sélection attendue');
    expect(destinations(etat, selection.interaction)).toEqual([22]);
  });

  it('avance dans la rafle sans la jouer, puis la conclut', () => {
    const selection = toucher(etat, INTERACTION_VIDE, 33);
    if (selection.type !== 'selection') throw new Error('sélection attendue');

    // Premier saut : la rafle continue, aucun coup n'est encore joué.
    const palier = toucher(etat, selection.interaction, 22);
    expect(palier.type).toBe('rafle');
    if (palier.type !== 'rafle') return;

    // Après le premier saut, seule la continuation est proposée : le
    // joueur ne peut pas changer de rafle en route.
    expect(destinations(etat, palier.interaction)).toEqual([11]);

    const fin = toucher(etat, palier.interaction, 11);
    expect(fin.type).toBe('coup');
    if (fin.type !== 'coup') return;
    expect(fin.coup.captures).toHaveLength(2);
  });
});
