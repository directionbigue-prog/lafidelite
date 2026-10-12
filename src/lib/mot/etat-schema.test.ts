import { describe, expect, it } from 'vitest';
import { parseEtatMot } from './etat-schema';
import { positionDepart } from './etat';

describe('validation de la forme de l’état', () => {
  it('accepte un état produit par le moteur', () => {
    const depart = positionDepart();
    expect(parseEtatMot(JSON.parse(JSON.stringify(depart)))).toEqual(depart);
  });

  it('accepte une manche avec un mot choisi et des tentatives', () => {
    const etat = {
      manches: [
        { proposeur: 'un', devineur: 'deux', mot: 'arbre', tentatives: ['carte', 'table'] },
      ],
    };
    expect(parseEtatMot(etat)).toEqual(etat);
  });

  it('accepte une partie à deux manches', () => {
    const etat = {
      manches: [
        { proposeur: 'un', devineur: 'deux', mot: 'arbre', tentatives: ['arbre'] },
        { proposeur: 'deux', devineur: 'un', mot: null, tentatives: [] },
      ],
    };
    expect(parseEtatMot(etat)).toEqual(etat);
  });

  it('refuse une partie sans aucune manche', () => {
    expect(parseEtatMot({ manches: [] })).toBeNull();
  });

  it('refuse une troisième manche', () => {
    const uneManche = { proposeur: 'un', devineur: 'deux', mot: null, tentatives: [] };
    expect(parseEtatMot({ manches: [uneManche, uneManche, uneManche] })).toBeNull();
  });

  it('refuse un proposeur et un devineur identiques', () => {
    expect(
      parseEtatMot({
        manches: [{ proposeur: 'un', devineur: 'un', mot: null, tentatives: [] }],
      }),
    ).toBeNull();
  });

  it('refuse un joueur inconnu au proposeur ou au devineur', () => {
    expect(
      parseEtatMot({
        manches: [{ proposeur: 'trois', devineur: 'deux', mot: null, tentatives: [] }],
      }),
    ).toBeNull();
  });

  it('refuse un mot en majuscules', () => {
    // Forme, pas légalité : ce n'est pas parce que « ARBRE » n'est pas un
    // mot du dictionnaire que ce schéma le rejette pour cette raison — il
    // le rejette parce que ce moteur ne stocke QUE des minuscules (voir
    // `normaliserMot`), et qu'un état qui n'en porte pas est déjà corrompu
    // par rapport à ce que ce moteur produit lui-même.
    expect(
      parseEtatMot({
        manches: [{ proposeur: 'un', devineur: 'deux', mot: 'ARBRE', tentatives: [] }],
      }),
    ).toBeNull();
  });

  it('refuse un mot qui ne compte pas cinq lettres', () => {
    expect(
      parseEtatMot({
        manches: [{ proposeur: 'un', devineur: 'deux', mot: 'arbres', tentatives: [] }],
      }),
    ).toBeNull();
    expect(
      parseEtatMot({
        manches: [{ proposeur: 'un', devineur: 'deux', mot: 'arb', tentatives: [] }],
      }),
    ).toBeNull();
  });

  it('accepte un mot n’existant pas dans le dictionnaire, du moment qu’il a la bonne forme', () => {
    // Délibéré, comme pour les trois autres jeux : ce schéma valide la
    // FORME, pas les règles. Un mot bien formé mais absent du dictionnaire
    // n'est pas une position atteignable dans une vraie partie (le moteur
    // le refuserait à la source), mais ce n'est pas à ce schéma d'en
    // juger — c'est `partie.ts` qui vérifie le dictionnaire, jamais le
    // serveur.
    expect(
      parseEtatMot({
        manches: [{ proposeur: 'un', devineur: 'deux', mot: 'zzzzz', tentatives: [] }],
      }),
    ).not.toBeNull();
  });

  it('refuse plus de six tentatives', () => {
    const tentatives = ['carte', 'table', 'chien', 'porte', 'trace', 'melon', 'ordre'];
    expect(
      parseEtatMot({
        manches: [{ proposeur: 'un', devineur: 'deux', mot: 'arbre', tentatives }],
      }),
    ).toBeNull();
  });

  it('refuse un champ en plus, non déclaré', () => {
    expect(
      parseEtatMot({
        manches: [{ proposeur: 'un', devineur: 'deux', mot: null, tentatives: [], score: 3 }],
      }),
    ).toBeNull();
  });

  it('refuse ce qui n’est pas un objet', () => {
    expect(parseEtatMot(null)).toBeNull();
    expect(parseEtatMot('arbre')).toBeNull();
    expect(parseEtatMot(42)).toBeNull();
  });
});
