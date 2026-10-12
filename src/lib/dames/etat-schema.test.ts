import { describe, expect, it } from 'vitest';
import { parseEtatPlateau } from './etat-schema';
import { positionDepart } from './etat';

describe('validation de la forme de l’état', () => {
  it('accepte un état produit par le moteur', () => {
    const depart = positionDepart();
    expect(parseEtatPlateau(JSON.parse(JSON.stringify(depart)))).toEqual(depart);
  });

  it('refuse un plateau qui n’a pas 50 cases', () => {
    expect(parseEtatPlateau({ cases: [null, null], trait: 'blanc' })).toBeNull();
  });

  it('refuse un camp inconnu', () => {
    const cases = Array.from({ length: 50 }, () => null) as unknown[];
    cases[0] = { camp: 'vert', dame: false };
    expect(parseEtatPlateau({ cases, trait: 'blanc' })).toBeNull();
  });

  it('refuse un trait invalide', () => {
    const cases = Array.from({ length: 50 }, () => null);
    expect(parseEtatPlateau({ cases, trait: 'personne' })).toBeNull();
  });

  it('refuse ce qui n’est pas un objet', () => {
    expect(parseEtatPlateau(null)).toBeNull();
    expect(parseEtatPlateau('blanc')).toBeNull();
    expect(parseEtatPlateau(42)).toBeNull();
  });

  it('accepte une position illégale mais bien formée', () => {
    // Délibéré : ce schéma valide la FORME, pas les règles. Un plateau sans
    // aucune pièce blanche est absurde au jeu et parfaitement valide ici —
    // le serveur n'arbitre pas les parties de dames.
    const cases = Array.from({ length: 50 }, () => null);
    expect(parseEtatPlateau({ cases, trait: 'blanc' })).not.toBeNull();
  });
});
