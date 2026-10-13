import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  nomDuSecondJoueur,
  SECOND_JOUEUR_SANS_COUPLE,
  SECOND_JOUEUR_SANS_PRENOM,
} from './second-joueur';

describe('nomDuSecondJoueur', () => {
  it('prend le prénom du partenaire quand le couple est actif', () => {
    expect(nomDuSecondJoueur({ couple: { status: 'ACTIVE', partnerName: 'Malick' } })).toBe(
      'Malick',
    );
  });

  it('dit « Votre partenaire » quand le couple est actif mais sans prénom', () => {
    expect(nomDuSecondJoueur({ couple: { status: 'ACTIVE', partnerName: null } })).toBe(
      SECOND_JOUEUR_SANS_PRENOM,
    );
    expect(nomDuSecondJoueur({ couple: { status: 'ACTIVE', partnerName: '' } })).toBe(
      SECOND_JOUEUR_SANS_PRENOM,
    );
  });

  it('ne parle pas de partenaire à un compte sans couple', () => {
    expect(nomDuSecondJoueur({ couple: null })).toBe(SECOND_JOUEUR_SANS_COUPLE);
  });

  it('traite un couple en attente comme un compte seul', () => {
    // Personne n'a encore rejoint : celui qui joue à côté n'est pas « le
    // partenaire », même si une invitation court.
    expect(nomDuSecondJoueur({ couple: { status: 'PENDING' } })).toBe(SECOND_JOUEUR_SANS_COUPLE);
  });
});

describe('les cinq écrans du Salon nomment le second joueur par ce module', () => {
  const SALON = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'salon');

  for (const jeu of ['dames', 'awale', 'ludo', 'mot', 'mots-croises']) {
    it(jeu, () => {
      const source = readFileSync(path.join(SALON, jeu, 'page.tsx'), 'utf8');
      // Le setter doit recevoir le résultat de `nomDuSecondJoueur`, pas le
      // `partnerName` brut — sinon un compte seul voit « Votre partenaire ».
      expect(source).toMatch(/setNomPartenaire\(nomDuSecondJoueur\(res\)\)/);
      expect(source).not.toMatch(/setNomPartenaire\(res\.couple\?\.partnerName/);
    });
  }
});
