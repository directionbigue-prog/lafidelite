import { describe, expect, it } from 'vitest';
import {
  decisionAttente,
  decisionRevelation,
  PLUS_DE_PARTIE,
  questionSurLeMauvaisTelephone,
  type SessionLue,
} from './distance';

function session(p: Partial<SessionLue>): SessionLue {
  return {
    id: 's1',
    phase: 'PASS_DEVICE',
    activePlayerRole: 'CREATOR',
    currentQuestionNumber: 2,
    ...p,
  };
}

describe('decisionAttente — le téléphone qui attend son tour', () => {
  it('attend tant que le tour est à l’autre, même quand l’autre a l’écran de question ouvert', () => {
    expect(decisionAttente(session({ activePlayerRole: 'PARTNER' }), 'CREATOR')).toEqual({
      kind: 'attendre',
    });
    expect(
      decisionAttente(session({ phase: 'ANSWERING', activePlayerRole: 'PARTNER' }), 'CREATOR'),
    ).toEqual({ kind: 'attendre' });
  });

  it('passe à « À toi » dès que le tour lui revient', () => {
    expect(decisionAttente(session({ activePlayerRole: 'CREATOR' }), 'CREATOR')).toEqual({
      kind: 'a-toi',
    });
  });

  it('suit la partie vers la révélation quand la manche se termine', () => {
    expect(decisionAttente(session({ phase: 'ROUND_REVEAL' }), 'CREATOR')).toEqual({
      kind: 'aller',
      path: '/jeu/s1/manche-revelee',
    });
  });

  it('refuse de deviner le tour sans rôle connu', () => {
    expect(decisionAttente(session({}), '')).toEqual({ kind: 'erreur' });
  });

  it('une partie disparue ramène à l’accueil du jeu', () => {
    expect(decisionAttente(PLUS_DE_PARTIE, 'CREATOR')).toEqual({ kind: 'aller', path: '/jeu' });
  });

  it('une phase inconnue est une erreur, pas une route devinée', () => {
    expect(decisionAttente(session({ phase: 'BIZARRE' }), 'CREATOR')).toEqual({ kind: 'erreur' });
  });
});

describe('decisionRevelation — suivre l’autre après « Continuer »', () => {
  it('reste tant que la révélation est en cours', () => {
    expect(decisionRevelation(session({ phase: 'ROUND_REVEAL' }), 's1')).toEqual({
      kind: 'rester',
    });
  });

  it('montre l’intro de la manche suivante, pas « À toi » directement', () => {
    expect(
      decisionRevelation(session({ phase: 'PASS_DEVICE', currentQuestionNumber: 1 }), 's1'),
    ).toEqual({ kind: 'aller', path: '/jeu/s1/manche-intro' });
  });

  it('après la dernière manche, le 404 de /current mène aux résultats de CETTE partie', () => {
    expect(decisionRevelation(PLUS_DE_PARTIE, 's1')).toEqual({
      kind: 'aller',
      path: '/jeu/s1/resultats',
    });
  });
});

describe('questionSurLeMauvaisTelephone', () => {
  it('à distance, seul le joueur actif ouvre la question', () => {
    expect(questionSurLeMauvaisTelephone(true, 'PARTNER', 'CREATOR')).toBe(true);
    expect(questionSurLeMauvaisTelephone(true, 'CREATOR', 'CREATOR')).toBe(false);
  });

  it('en pass-and-play, un seul téléphone sert aux deux : jamais de renvoi', () => {
    expect(questionSurLeMauvaisTelephone(false, 'PARTNER', 'CREATOR')).toBe(false);
  });

  it('un rôle inconnu ne bloque pas la question', () => {
    expect(questionSurLeMauvaisTelephone(true, 'PARTNER', '')).toBe(false);
  });
});
