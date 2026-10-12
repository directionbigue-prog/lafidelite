import { describe, expect, it } from 'vitest';
import { positionDepart } from './etat';
import { tenterMot } from './partie';
import { definitionsAffichees, emplacementCouvre, grilleAffichee } from './affichage';

const H0 = { direction: 'horizontal', index: 0 } as const; // aimer
const V0 = { direction: 'vertical', index: 0 } as const; // avril

describe('grilleAffichee', () => {
  it('ne révèle aucune lettre au départ, mais marque déjà les cases noires', () => {
    const cellules = grilleAffichee(positionDepart('avril'));
    expect(cellules[0]?.[0]).toEqual({ type: 'lettre', lettre: null });
    expect(cellules[1]?.[1]).toEqual({ type: 'noire' });
    expect(cellules[1]?.[3]).toEqual({ type: 'noire' });
    expect(cellules[3]?.[1]).toEqual({ type: 'noire' });
    expect(cellules[3]?.[3]).toEqual({ type: 'noire' });
  });

  it('révèle toute la ligne d’un mot horizontal trouvé', () => {
    const etat = tenterMot(positionDepart('avril'), H0, 'aimer').etat;
    const cellules = grilleAffichee(etat);
    expect(cellules[0]).toEqual([
      { type: 'lettre', lettre: 'a' },
      { type: 'lettre', lettre: 'i' },
      { type: 'lettre', lettre: 'm' },
      { type: 'lettre', lettre: 'e' },
      { type: 'lettre', lettre: 'r' },
    ]);
    // Rien d'autre n'est révélé : la ligne 2 (mot « rires », pas trouvé)
    // reste vide, y compris ses croisements avec les verticaux non trouvés.
    expect(cellules[2]).toEqual([
      { type: 'lettre', lettre: null },
      { type: 'lettre', lettre: null },
      { type: 'lettre', lettre: null },
      { type: 'lettre', lettre: null },
      { type: 'lettre', lettre: null },
    ]);
  });

  it('une case de croisement se révèle dès qu’UN SEUL des deux mots qui la couvrent est trouvé', () => {
    // (0,0) est couverte par H0 ('aimer') ET V0 ('avril'). Trouver V0 seul
    // suffit à révéler (0,0), sans que H0 le soit.
    const etat = tenterMot(positionDepart('avril'), V0, 'avril').etat;
    const cellules = grilleAffichee(etat);
    expect(cellules[0]?.[0]).toEqual({ type: 'lettre', lettre: 'a' });
    expect(cellules[0]?.[1]).toEqual({ type: 'lettre', lettre: null }); // pas couverte par V0
  });
});

describe('definitionsAffichees', () => {
  it('donne les six définitions, non trouvées au départ', () => {
    const definitions = definitionsAffichees(positionDepart('avril'));
    expect(definitions).toHaveLength(6);
    expect(definitions.every((d) => !d.trouve && d.trouvePar === null)).toBe(true);
    expect(definitions[0]).toMatchObject({ direction: 'horizontal', index: 0 });
  });

  it('marque une définition trouvée avec qui l’a trouvée', () => {
    const etat = tenterMot(positionDepart('avril'), H0, 'aimer').etat;
    const definitions = definitionsAffichees(etat);
    const h0 = definitions.find((d) => d.direction === 'horizontal' && d.index === 0);
    expect(h0).toMatchObject({ trouve: true, trouvePar: 'un' });
    const h1 = definitions.find((d) => d.direction === 'horizontal' && d.index === 1);
    expect(h1).toMatchObject({ trouve: false, trouvePar: null });
  });
});

describe('emplacementCouvre', () => {
  it('un horizontal couvre toute sa ligne, aucune autre', () => {
    expect(emplacementCouvre(H0, 0, 0)).toBe(true);
    expect(emplacementCouvre(H0, 0, 4)).toBe(true);
    expect(emplacementCouvre(H0, 2, 0)).toBe(false);
  });

  it('un vertical couvre toute sa colonne, aucune autre', () => {
    expect(emplacementCouvre(V0, 0, 0)).toBe(true);
    expect(emplacementCouvre(V0, 4, 0)).toBe(true);
    expect(emplacementCouvre(V0, 0, 2)).toBe(false);
  });
});
