import { describe, expect, it } from 'vitest';
import { parseEtatAwale } from './etat-schema';
import { positionDepart } from './etat';

describe('validation de la forme de l’état', () => {
  it('accepte un état produit par le moteur', () => {
    const depart = positionDepart();
    expect(parseEtatAwale(JSON.parse(JSON.stringify(depart)))).toEqual(depart);
  });

  it('refuse un plateau qui n’a pas douze trous', () => {
    expect(
      parseEtatAwale({ trous: [4, 4], greniers: { sud: 0, nord: 0 }, trait: 'sud' }),
    ).toBeNull();
  });

  it('refuse un trou négatif', () => {
    const trous = Array.from({ length: 12 }, () => 4);
    trous[0] = -1;
    expect(parseEtatAwale({ trous, greniers: { sud: 5, nord: 0 }, trait: 'sud' })).toBeNull();
  });

  it('refuse un grenier négatif', () => {
    const trous = Array.from({ length: 12 }, () => 4);
    expect(parseEtatAwale({ trous, greniers: { sud: -1, nord: 1 }, trait: 'sud' })).toBeNull();
  });

  it('refuse un camp inconnu au trait', () => {
    const trous = Array.from({ length: 12 }, () => 4);
    expect(parseEtatAwale({ trous, greniers: { sud: 0, nord: 0 }, trait: 'ouest' })).toBeNull();
  });

  it('refuse ce qui n’est pas un objet', () => {
    expect(parseEtatAwale(null)).toBeNull();
    expect(parseEtatAwale('sud')).toBeNull();
    expect(parseEtatAwale(42)).toBeNull();
  });

  it('accepte une position illégale mais bien formée', () => {
    // Délibéré : ce schéma valide la FORME, pas les règles. Un plateau où
    // un seul trou porte les 48 graines est absurde au jeu (aucun coup ne
    // sème 48 graines d'un coup) et parfaitement valide ici — le serveur
    // n'arbitre pas les parties d'Awalé.
    const trous = Array.from({ length: 12 }, () => 0);
    trous[0] = 48;
    expect(parseEtatAwale({ trous, greniers: { sud: 0, nord: 0 }, trait: 'sud' })).not.toBeNull();
  });

  describe('la conservation des quarante-huit graines — garde que les dames n’ont pas', () => {
    it('refuse un total différent de 48, même bien formé sinon', () => {
      // Un trou de moins que le départ : 47 graines au total. Une garde de
      // pure forme, mais qui attrape un état corrompu qu'aucune des
      // vérifications précédentes ne voit (douze entiers positifs, un trait
      // valide — tout y est, sauf le compte).
      const trous = Array.from({ length: 12 }, () => 4);
      trous[0] = 3;
      expect(parseEtatAwale({ trous, greniers: { sud: 0, nord: 0 }, trait: 'sud' })).toBeNull();
    });

    it('accepte 48 graines réparties autrement qu’au départ, greniers compris', () => {
      const trous = Array.from({ length: 12 }, () => 0);
      expect(
        parseEtatAwale({ trous, greniers: { sud: 24, nord: 24 }, trait: 'nord' }),
      ).not.toBeNull();
    });
  });
});
