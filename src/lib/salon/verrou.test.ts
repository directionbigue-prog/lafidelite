import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PACKS } from '@/lib/game/packs';
import { COUPLES_ERROR_MESSAGES } from '@/lib/couples-error-messages';
import { MESSAGE_SALON_VERROUILLE } from './verrou';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('MESSAGE_SALON_VERROUILLE', () => {
  it('nomme chaque pack en vente qui ouvre le Salon', () => {
    for (const pack of PACKS.filter((p) => p.prix > 0 && p.enVente && p.salon)) {
      expect(MESSAGE_SALON_VERROUILLE).toContain(pack.nom);
    }
  });

  it('ne nomme aucun pack retiré de la vente', () => {
    for (const pack of PACKS.filter((p) => !p.enVente)) {
      expect(MESSAGE_SALON_VERROUILLE).not.toContain(pack.nom);
    }
  });

  it('est la phrase que lisent la table des erreurs et les cinq écrans', () => {
    expect(COUPLES_ERROR_MESSAGES.SALON_LOCKED).toBe(MESSAGE_SALON_VERROUILLE);
    for (const jeu of ['dames', 'awale', 'ludo', 'mot', 'mots-croises']) {
      const source = readFileSync(path.join(SRC, 'app', 'salon', jeu, 'page.tsx'), 'utf8');
      expect(source, jeu).toContain('return MESSAGE_SALON_VERROUILLE;');
      expect(source, jeu).not.toContain('Essentiel, Intégral et Annuel');
    }
  });
});
