import { describe, expect, it } from 'vitest';
import { positionDepart } from './etat';
import { choisirMot, passerManche, tenterMot } from './partie';
import { appareilConfirmeInitial, phaseEcran } from './ecran';

describe('phaseEcran', () => {
  it('choix-mot : une manche sans mot choisi, quel que soit `appareilConfirme`', () => {
    const etat = positionDepart();
    expect(phaseEcran(etat, false).kind).toBe('choix-mot');
    expect(phaseEcran(etat, true).kind).toBe('choix-mot');
  });

  it('attente-passage : le mot est choisi, mais l’appareil n’est pas encore confirmé', () => {
    const etat = choisirMot(positionDepart(), 'arbre');
    const phase = phaseEcran(etat, false);
    expect(phase.kind).toBe('attente-passage');
    if (phase.kind === 'attente-passage') {
      expect(phase.manche.mot).toBe('arbre'); // narrowé à `string`, pas `string | null`
    }
  });

  it('deviner : le mot est choisi et l’appareil est confirmé', () => {
    const etat = choisirMot(positionDepart(), 'arbre');
    const phase = phaseEcran(etat, true);
    expect(phase.kind).toBe('deviner');
  });

  it('fin-manche : la manche est terminée, mais il n’y a encore qu’une manche', () => {
    const etat = tenterMot(choisirMot(positionDepart(), 'arbre'), 'arbre');
    // La fin de manche l'emporte sur `appareilConfirme`, dans un sens comme
    // dans l'autre — une manche terminée ne redevient jamais « deviner ».
    expect(phaseEcran(etat, false).kind).toBe('fin-manche');
    expect(phaseEcran(etat, true).kind).toBe('fin-manche');
  });

  it('fin-partie : la seconde manche est terminée', () => {
    let etat = tenterMot(choisirMot(positionDepart(), 'arbre'), 'arbre');
    etat = passerManche(etat);
    etat = tenterMot(choisirMot(etat, 'porte'), 'porte');
    expect(phaseEcran(etat, true).kind).toBe('fin-partie');
  });

  it('n’annonce pas la fin de partie tant que la seconde manche n’a pas de mot choisi', () => {
    let etat = tenterMot(choisirMot(positionDepart(), 'arbre'), 'arbre');
    etat = passerManche(etat);
    expect(phaseEcran(etat, false).kind).toBe('choix-mot');
  });
});

describe('appareilConfirmeInitial', () => {
  it('faux tant qu’aucune tentative n’a été enregistrée', () => {
    expect(appareilConfirmeInitial(positionDepart())).toBe(false);
    expect(appareilConfirmeInitial(choisirMot(positionDepart(), 'arbre'))).toBe(false);
  });

  it('vrai dès qu’une tentative existe — la trace indirecte que l’appareil a déjà été passé', () => {
    const etat = tenterMot(choisirMot(positionDepart(), 'arbre'), 'carte');
    expect(appareilConfirmeInitial(etat)).toBe(true);
  });
});
