import { describe, expect, it } from 'vitest';
import { JEUX, estUnJeu, etatInitial, parseEtat, type Jeu } from './jeux';
import { NB_CASES } from '@/lib/dames/plateau';
import { NB_TROUS } from '@/lib/awale/etat';
import type { EtatLudo } from '@/lib/ludo/etat';
import type { EtatMot } from '@/lib/mot/etat';
import { GRILLES } from '@/lib/mots-croises/grilles';
import type { EtatMotsCroises } from '@/lib/mots-croises/etat';

describe('les jeux du Salon', () => {
  it('reconnaît un jeu de la liste et rejette tout le reste', () => {
    for (const jeu of JEUX) expect(estUnJeu(jeu)).toBe(true);
    expect(estUnJeu('ECHECS')).toBe(false);
    expect(estUnJeu(null)).toBe(false);
    expect(estUnJeu(42)).toBe(false);
    expect(estUnJeu({ kind: 'DAMES' })).toBe(false);
  });

  it('donne à chaque jeu de la liste un état initial, jamais `undefined`', () => {
    // La garde d'exhaustivité de `etatInitial` est un contrôle de
    // compilation ; ce test-ci en vérifie la conséquence observable, qui
    // est celle qui atteignait la base : un `state: undefined` sur une
    // colonne JSONB NOT NULL rend un 500.
    for (const jeu of JEUX) expect(etatInitial(jeu)).not.toBeUndefined();
  });

  it('ouvre les dames sur un plateau complet, aux blancs', () => {
    const depart = etatInitial('DAMES') as { cases: unknown[]; trait: string };
    expect(depart.cases).toHaveLength(NB_CASES);
    expect(depart.trait).toBe('blanc');
  });

  it('ouvre l’Awalé sur douze trous de quatre graines, à sud', () => {
    const depart = etatInitial('AWALE') as {
      trous: number[];
      greniers: { sud: number; nord: number };
      trait: string;
    };
    expect(depart.trous).toHaveLength(NB_TROUS);
    expect(depart.trous.every((graines) => graines === 4)).toBe(true);
    expect(depart.greniers).toEqual({ sud: 0, nord: 0 });
    expect(depart.trait).toBe('sud');
  });

  it('ouvre le Ludo sur huit pions à l’enclos, à sud, sans dé lancé', () => {
    const depart = etatInitial('LUDO') as EtatLudo;
    expect(depart.pions.sud.every((pion) => pion.zone === 'enclos')).toBe(true);
    expect(depart.pions.nord.every((pion) => pion.zone === 'enclos')).toBe(true);
    expect(depart.trait).toBe('sud');
    expect(depart.de).toBeNull();
  });

  it('ouvre Le Mot sur une seule manche, sans mot choisi, « un » proposant à « deux »', () => {
    const depart = etatInitial('MOT') as EtatMot;
    expect(depart.manches).toHaveLength(1);
    expect(depart.manches[0]).toEqual({
      proposeur: 'un',
      devineur: 'deux',
      mot: null,
      tentatives: [],
    });
  });

  it('ouvre les mots croisés sur une grille tirée au sort, aucun mot trouvé, « un » au trait', () => {
    const depart = etatInitial('MOTS_CROISES') as EtatMotsCroises;
    expect(GRILLES.some((grille) => grille.id === depart.idGrille)).toBe(true);
    expect(depart.trouves).toEqual([]);
    expect(depart.trait).toBe('un');
    expect(depart.passesConsecutifs).toBe(0);
  });

  it('refuse bruyamment un jeu sans état initial plutôt que d’écrire `undefined`', () => {
    // Le cast force le cas que le typecheck interdit — les cinq jeux réels
    // ont désormais tous leur `case`, donc c'est un SIXIÈME jeu imaginaire
    // qui simule celui qui manquerait. Si le `default` du `switch`
    // disparaît, cet appel rend `undefined` au lieu de lever — et c'est
    // exactement ce que la base recevrait.
    expect(() => etatInitial('SCRABBLE' as Jeu)).toThrow(/état initial/);
  });

  it('relit l’état d’un jeu par son schéma, et rend `null` sur un état corrompu', () => {
    const depart = etatInitial('DAMES');
    expect(parseEtat('DAMES', depart)).not.toBeNull();
    expect(parseEtat('DAMES', { cases: [], trait: 'blanc' })).toBeNull();
    expect(parseEtat('DAMES', null)).toBeNull();
  });

  it('relit l’état de l’Awalé par son propre schéma, indépendamment de celui des dames', () => {
    // La garde qui aurait laissé passer un jeu ajouté à `JEUX` sans son
    // `case` dans `parseEtat` : sans lui, l'état de l'Awalé traverserait le
    // schéma des dames (`cases`, `trait: 'blanc'|'noir'`) et rendrait `null`
    // à chaque lecture — la partie redémarrerait à zéro à chaque rechargement
    // de l'onglet.
    const depart = etatInitial('AWALE');
    expect(parseEtat('AWALE', depart)).not.toBeNull();
    expect(
      parseEtat('AWALE', { trous: [], greniers: { sud: 0, nord: 0 }, trait: 'sud' }),
    ).toBeNull();
    expect(parseEtat('AWALE', null)).toBeNull();
    // Réciproque : un état de dames ne passe pas par le schéma de l'Awalé.
    expect(parseEtat('AWALE', etatInitial('DAMES'))).toBeNull();
  });

  it('relit l’état du Ludo par son propre schéma, indépendamment des deux autres', () => {
    const depart = etatInitial('LUDO');
    expect(parseEtat('LUDO', depart)).not.toBeNull();
    // Un état des dames ou de l'Awalé ne passe pas par le schéma du Ludo —
    // même garde que pour l'Awalé vs les dames ci-dessus.
    expect(parseEtat('LUDO', etatInitial('DAMES'))).toBeNull();
    expect(parseEtat('LUDO', etatInitial('AWALE'))).toBeNull();
    expect(parseEtat('LUDO', null)).toBeNull();
  });

  it('relit l’état du Mot par son propre schéma, indépendamment des trois autres', () => {
    const depart = etatInitial('MOT');
    expect(parseEtat('MOT', depart)).not.toBeNull();
    expect(parseEtat('MOT', etatInitial('DAMES'))).toBeNull();
    expect(parseEtat('MOT', etatInitial('AWALE'))).toBeNull();
    expect(parseEtat('MOT', etatInitial('LUDO'))).toBeNull();
    expect(parseEtat('MOT', null)).toBeNull();
  });

  it('relit l’état des mots croisés par son propre schéma, indépendamment des quatre autres', () => {
    const depart = etatInitial('MOTS_CROISES');
    expect(parseEtat('MOTS_CROISES', depart)).not.toBeNull();
    expect(parseEtat('MOTS_CROISES', etatInitial('DAMES'))).toBeNull();
    expect(parseEtat('MOTS_CROISES', etatInitial('AWALE'))).toBeNull();
    expect(parseEtat('MOTS_CROISES', etatInitial('LUDO'))).toBeNull();
    expect(parseEtat('MOTS_CROISES', etatInitial('MOT'))).toBeNull();
    expect(parseEtat('MOTS_CROISES', null)).toBeNull();
  });

  it('refuse bruyamment un jeu sans schéma d’état', () => {
    expect(() => parseEtat('SCRABBLE' as Jeu, {})).toThrow(/schéma/);
  });
});
