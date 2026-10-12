import { describe, expect, it } from 'vitest';
import { positionDepart, type EtatMot, type Manche } from './etat';
import {
  choisirMot,
  issue,
  mancheTerminee,
  passerManche,
  tentativesPourTrouver,
  tenterMot,
} from './partie';

function manche(partial: Partial<Manche>): Manche {
  return { proposeur: 'un', devineur: 'deux', mot: null, tentatives: [], ...partial };
}

describe('choisirMot', () => {
  it('installe le mot normalisé sur la manche courante', () => {
    const etat = positionDepart();
    const suivant = choisirMot(etat, ' ARBRE ');
    expect(suivant.manches[0]).toMatchObject({ mot: 'arbre' });
    // N'a pas modifié l'état reçu — invariant de tout le moteur.
    expect(etat.manches[0]).toMatchObject({ mot: null });
  });

  it('refuse un mot hors dictionnaire', () => {
    const etat = positionDepart();
    expect(() => choisirMot(etat, 'xzqwj')).toThrow(/dictionnaire/);
  });

  it('refuse de remplacer un mot déjà choisi', () => {
    const etat = choisirMot(positionDepart(), 'arbre');
    expect(() => choisirMot(etat, 'porte')).toThrow(/déjà choisi/);
  });
});

describe('tenterMot', () => {
  it('ajoute la tentative normalisée à la manche courante', () => {
    const etat = choisirMot(positionDepart(), 'arbre');
    const suivant = tenterMot(etat, ' CARTE ');
    expect(suivant.manches[0]?.tentatives).toEqual(['carte']);
  });

  it('refuse tant qu’aucun mot n’a été choisi', () => {
    expect(() => tenterMot(positionDepart(), 'carte')).toThrow(/Aucun mot/);
  });

  it('refuse une manche déjà terminée', () => {
    let etat = choisirMot(positionDepart(), 'arbre');
    etat = tenterMot(etat, 'arbre'); // trouvé du premier coup
    expect(() => tenterMot(etat, 'carte')).toThrow(/déjà terminée/);
  });

  describe('une tentative hors dictionnaire ne consomme aucun essai', () => {
    it('lève sans ajouter la tentative à l’état — la garde centrale de la spec', () => {
      const etat = choisirMot(positionDepart(), 'arbre');
      expect(() => tenterMot(etat, 'zzzzz')).toThrow(/dictionnaire/);
      // La preuve que rien n'a été consommé : rejouer le MÊME état, en
      // enchaînant six tentatives réelles, doit encore réussir — la
      // tentative refusée ci-dessus n'a donc pas grignoté sur les six.
      let courant = etat;
      for (const mot of ['carte', 'table', 'chien', 'porte', 'trace', 'melon']) {
        courant = tenterMot(courant, mot);
      }
      expect(courant.manches[0]?.tentatives).toHaveLength(6);
      expect(mancheTerminee(courant.manches[0] as Manche)).toBe(true);
    });
  });
});

describe('mancheTerminee et tentativesPourTrouver', () => {
  it('n’est pas terminée sans mot choisi', () => {
    expect(mancheTerminee(manche({}))).toBe(false);
  });

  it('est terminée dès que le mot est trouvé, avant même d’épuiser les six tentatives', () => {
    const m = manche({ mot: 'arbre', tentatives: ['carte', 'arbre'] });
    expect(mancheTerminee(m)).toBe(true);
    expect(tentativesPourTrouver(m)).toBe(2);
  });

  it('est terminée après six tentatives, même sans avoir trouvé', () => {
    const m = manche({
      mot: 'arbre',
      tentatives: ['carte', 'table', 'chien', 'porte', 'trace', 'melon'],
    });
    expect(mancheTerminee(m)).toBe(true);
    expect(tentativesPourTrouver(m)).toBeNull();
  });

  it('n’est pas terminée avant six tentatives sans avoir trouvé', () => {
    const m = manche({ mot: 'arbre', tentatives: ['carte', 'table'] });
    expect(mancheTerminee(m)).toBe(false);
    expect(tentativesPourTrouver(m)).toBeNull();
  });
});

describe('passerManche', () => {
  it('ouvre la seconde manche, rôles échangés, sans mot ni tentative', () => {
    let etat = choisirMot(positionDepart(), 'arbre');
    etat = tenterMot(etat, 'arbre');
    const suivant = passerManche(etat);
    expect(suivant.manches).toHaveLength(2);
    expect(suivant.manches[1]).toEqual({
      proposeur: 'deux',
      devineur: 'un',
      mot: null,
      tentatives: [],
    });
    // La première manche traverse intacte.
    expect(suivant.manches[0]).toEqual(etat.manches[0]);
  });

  it('refuse tant que la première manche n’est pas terminée', () => {
    const etat = choisirMot(positionDepart(), 'arbre');
    expect(() => passerManche(etat)).toThrow(/n’est pas terminée/);
  });

  it('refuse d’ouvrir une troisième manche', () => {
    let etat = choisirMot(positionDepart(), 'arbre');
    etat = tenterMot(etat, 'arbre');
    etat = passerManche(etat);
    etat = choisirMot(etat, 'porte');
    etat = tenterMot(etat, 'porte');
    expect(() => passerManche(etat)).toThrow(/déjà ses deux manches/);
  });
});

describe('issue', () => {
  function partieAvecDeuxManches(
    tentativesPremiere: readonly string[],
    tentativesSeconde: readonly string[],
  ): EtatMot {
    let etat = choisirMot(positionDepart(), 'arbre');
    for (const t of tentativesPremiere) etat = tenterMot(etat, t);
    etat = passerManche(etat);
    etat = choisirMot(etat, 'porte');
    for (const t of tentativesSeconde) etat = tenterMot(etat, t);
    return etat;
  }

  it('n’est pas finie avec une seule manche, même terminée', () => {
    const etat = tenterMot(choisirMot(positionDepart(), 'arbre'), 'arbre');
    expect(issue(etat)).toEqual({ fini: false });
  });

  it('n’est pas finie tant que la seconde manche continue', () => {
    const etat = partieAvecDeuxManches(['arbre'], ['table']);
    expect(issue(etat)).toEqual({ fini: false });
  });

  it('donne la victoire au devineur qui a trouvé en moins de tentatives', () => {
    // Manche 1 (mot « arbre ») : « deux » devine (c'est lui le devineur de
    // la première manche — voir `positionDepart`), et trouve en 1 coup.
    // Manche 2 (mot « porte », rôles échangés) : « un » devine, et trouve
    // en 3 coups. 1 < 3, donc « deux » gagne.
    const etat = partieAvecDeuxManches(['arbre'], ['table', 'chien', 'porte']);
    expect(issue(etat)).toEqual({ fini: true, vainqueur: 'deux' });
  });

  it('donne la victoire à celui qui a trouvé, contre celui qui n’a pas trouvé', () => {
    const etat = partieAvecDeuxManches(
      ['carte', 'table', 'chien', 'porte', 'trace', 'melon'], // « deux » ne trouve pas
      ['porte'], // « un » trouve en 1 coup
    );
    expect(issue(etat)).toEqual({ fini: true, vainqueur: 'un' });
  });

  it('est nulle à égalité de tentatives', () => {
    const etat = partieAvecDeuxManches(['carte', 'arbre'], ['table', 'porte']);
    expect(issue(etat)).toEqual({ fini: true, vainqueur: null });
  });

  it('est nulle si ni l’un ni l’autre ne trouve', () => {
    const echec = ['carte', 'table', 'chien', 'ordre', 'trace', 'melon'];
    const etat = partieAvecDeuxManches(echec, echec);
    expect(issue(etat)).toEqual({ fini: true, vainqueur: null });
  });
});
