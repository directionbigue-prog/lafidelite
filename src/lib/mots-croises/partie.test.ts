import { describe, expect, it } from 'vitest';
import { positionDepart, type EtatMotsCroises } from './etat';
import { estTrouve, issue, partieTerminee, passerTour, score, tenterMot } from './partie';

const H0 = { direction: 'horizontal', index: 0 } as const; // aimer
const H1 = { direction: 'horizontal', index: 1 } as const; // rires
const H2 = { direction: 'horizontal', index: 2 } as const; // lente
const V0 = { direction: 'vertical', index: 0 } as const; // avril
const V1 = { direction: 'vertical', index: 1 } as const; // marin
const V2 = { direction: 'vertical', index: 2 } as const; // reste

describe('tenterMot', () => {
  it('inscrit le mot et le compte à celui qui l’a trouvé, sur une réponse juste', () => {
    const etat = positionDepart('avril');
    const resultat = tenterMot(etat, H0, 'aimer');
    expect(resultat.correct).toBe(true);
    expect(resultat.etat.trouves).toEqual([{ direction: 'horizontal', index: 0, trouvePar: 'un' }]);
    // N'a pas modifié l'état reçu — invariant de tout le moteur.
    expect(etat.trouves).toEqual([]);
  });

  it('n’inscrit rien sur une réponse fausse', () => {
    const etat = positionDepart('avril');
    const resultat = tenterMot(etat, H0, 'porte');
    expect(resultat.correct).toBe(false);
    expect(resultat.etat.trouves).toEqual([]);
  });

  it('accepte une réponse en majuscules ou accentuée', () => {
    // « aimer » est déjà sans accent dans grilles.ts, mais une proposition
    // « AIMÉR » doit compter — insensibilité à la casse ET aux accents.
    const etat = positionDepart('avril');
    expect(tenterMot(etat, H0, 'AIMER').correct).toBe(true);
    expect(tenterMot(etat, H0, '  Aimer  ').correct).toBe(true);
  });

  describe('l’alternance est stricte : le trait passe toujours, juste ou faux', () => {
    it('après une réponse juste, la main passe à l’autre joueur — jamais un tour de plus', () => {
      const etat = positionDepart('avril');
      expect(etat.trait).toBe('un');
      const resultat = tenterMot(etat, H0, 'aimer');
      expect(resultat.correct).toBe(true);
      expect(resultat.etat.trait).toBe('deux');
    });

    it('après une réponse fausse, la main passe aussi', () => {
      const etat = positionDepart('avril');
      const resultat = tenterMot(etat, H0, 'faux');
      expect(resultat.correct).toBe(false);
      expect(resultat.etat.trait).toBe('deux');
    });

    it('un enchaînement de bonnes réponses alterne le joueur qui les a trouvées', () => {
      let etat = positionDepart('avril');
      etat = tenterMot(etat, H0, 'aimer').etat; // « un »
      etat = tenterMot(etat, H1, 'rires').etat; // « deux »
      etat = tenterMot(etat, H2, 'lente').etat; // « un »
      expect(etat.trouves).toEqual([
        { direction: 'horizontal', index: 0, trouvePar: 'un' },
        { direction: 'horizontal', index: 1, trouvePar: 'deux' },
        { direction: 'horizontal', index: 2, trouvePar: 'un' },
      ]);
    });
  });

  it('remet le compteur de passages à zéro, juste ou faux', () => {
    let etat = positionDepart('avril');
    etat = passerTour(etat);
    expect(etat.passesConsecutifs).toBe(1);
    etat = tenterMot(etat, H0, 'aimer').etat;
    expect(etat.passesConsecutifs).toBe(0);
  });

  it('refuse un emplacement déjà trouvé', () => {
    let etat = positionDepart('avril');
    etat = tenterMot(etat, H0, 'aimer').etat;
    expect(() => tenterMot(etat, H0, 'aimer')).toThrow(/déjà sa réponse/);
  });

  it('refuse une partie déjà terminée', () => {
    let etat = positionDepart('avril');
    for (const [emplacement, mot] of [
      [H0, 'aimer'],
      [H1, 'rires'],
      [H2, 'lente'],
      [V0, 'avril'],
      [V1, 'marin'],
      [V2, 'reste'],
    ] as const) {
      etat = tenterMot(etat, emplacement, mot).etat;
    }
    expect(partieTerminee(etat)).toBe(true);
    expect(() => tenterMot(etat, H0, 'aimer')).toThrow(/déjà terminée/);
  });
});

describe('passerTour', () => {
  it('change le trait sans inscrire de mot', () => {
    const etat = positionDepart('avril');
    const suivant = passerTour(etat);
    expect(suivant.trait).toBe('deux');
    expect(suivant.trouves).toEqual([]);
    expect(suivant.passesConsecutifs).toBe(1);
    // N'a pas modifié l'état reçu.
    expect(etat.trait).toBe('un');
  });

  it('arrête la partie au second passage consécutif', () => {
    let etat = positionDepart('avril');
    etat = passerTour(etat);
    expect(partieTerminee(etat)).toBe(false);
    etat = passerTour(etat);
    expect(etat.passesConsecutifs).toBe(2);
    expect(partieTerminee(etat)).toBe(true);
  });

  it('refuse une partie déjà terminée', () => {
    let etat = positionDepart('avril');
    etat = passerTour(etat);
    etat = passerTour(etat);
    expect(() => passerTour(etat)).toThrow(/déjà terminée/);
  });

  it('un coup joué entre deux passages empêche la partie de s’arrêter', () => {
    let etat = positionDepart('avril');
    etat = passerTour(etat);
    etat = tenterMot(etat, H0, 'aimer').etat; // remet passesConsecutifs à 0
    etat = passerTour(etat);
    expect(partieTerminee(etat)).toBe(false);
    expect(etat.passesConsecutifs).toBe(1);
  });
});

describe('estTrouve', () => {
  it('distingue chaque emplacement des cinq autres', () => {
    const etat = tenterMot(positionDepart('avril'), H0, 'aimer').etat;
    expect(estTrouve(etat, H0)).toBe(true);
    expect(estTrouve(etat, H1)).toBe(false);
    expect(estTrouve(etat, V0)).toBe(false);
  });
});

describe('score et issue', () => {
  function partieAvec(reponses: readonly (readonly [typeof H0, string])[]): EtatMotsCroises {
    let etat = positionDepart('avril');
    for (const [emplacement, mot] of reponses) {
      etat = tenterMot(etat, emplacement, mot).etat;
    }
    return etat;
  }

  it('n’est pas finie tant que la grille n’est pas résolue et qu’il n’y a pas eu deux passages', () => {
    const etat = partieAvec([[H0, 'aimer']]);
    expect(issue(etat)).toEqual({ fini: false });
  });

  it('compte exactement les mots trouvés par chacun, et tranche à la majorité', () => {
    let etat = positionDepart('avril');
    etat = tenterMot(etat, H0, 'aimer').etat; // un trouve H0 -> trait à deux
    etat = tenterMot(etat, H1, 'rires').etat; // deux trouve H1 -> trait à un
    etat = tenterMot(etat, H2, 'faux').etat; // un se trompe sur H2 -> trait à deux
    etat = tenterMot(etat, V0, 'avril').etat; // deux trouve V0 -> trait à un
    etat = passerTour(etat); // un passe
    etat = passerTour(etat); // deux passe -> partie terminée
    expect(score(etat)).toEqual({ un: 1, deux: 2 });
    expect(issue(etat)).toEqual({ fini: true, vainqueur: 'deux' });
  });

  it('est nulle à score égal', () => {
    let etat = positionDepart('avril');
    etat = tenterMot(etat, H0, 'aimer').etat; // un : 1
    etat = tenterMot(etat, H1, 'rires').etat; // deux : 1
    etat = passerTour(etat);
    etat = passerTour(etat);
    expect(score(etat)).toEqual({ un: 1, deux: 1 });
    expect(issue(etat)).toEqual({ fini: true, vainqueur: null });
  });

  it('est nulle 0–0 si les deux passent d’entrée', () => {
    let etat = positionDepart('avril');
    etat = passerTour(etat);
    etat = passerTour(etat);
    expect(issue(etat)).toEqual({ fini: true, vainqueur: null });
  });

  it('se termine quand les six mots sont trouvés, même sans double passage', () => {
    let etat = positionDepart('avril');
    for (const [emplacement, mot] of [
      [H0, 'aimer'],
      [H1, 'rires'],
      [H2, 'lente'],
      [V0, 'avril'],
      [V1, 'marin'],
      [V2, 'reste'],
    ] as const) {
      etat = tenterMot(etat, emplacement, mot).etat;
    }
    expect(score(etat)).toEqual({ un: 3, deux: 3 });
    expect(issue(etat)).toEqual({ fini: true, vainqueur: null });
  });
});
