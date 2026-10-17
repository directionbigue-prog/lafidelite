import { describe, expect, it } from 'vitest';
import { TICS_DE_MONTEE, TICS_PAR_BOUCLE, valeurAuTic } from './compteur';

describe('le compteur du téléphone de fin de partie', () => {
  it('part de zéro et atteint la cible au bout de la montée', () => {
    expect(valeurAuTic(40, 0)).toBe(0);
    expect(valeurAuTic(40, TICS_DE_MONTEE)).toBe(40);
  });

  it('ne redescend jamais pendant la montée', () => {
    let precedente = -1;
    for (let tic = 0; tic <= TICS_DE_MONTEE; tic += 1) {
      const valeur = valeurAuTic(40, tic);
      expect(valeur, `tic ${tic}`).toBeGreaterThanOrEqual(precedente);
      precedente = valeur;
    }
  });

  it('monte vite au départ, comme un « ease-out »', () => {
    // Au tiers de la montée, une progression linéaire afficherait 13 sur 40.
    expect(valeurAuTic(40, TICS_DE_MONTEE / 3)).toBeGreaterThan(20);
  });

  it('garde la cible affichée jusqu’à la fin de la boucle', () => {
    for (let tic = TICS_DE_MONTEE; tic < TICS_PAR_BOUCLE; tic += 1) {
      expect(valeurAuTic(40, tic), `tic ${tic}`).toBe(40);
    }
  });

  it('recommence à chaque boucle, sans que l’appelant remette le tic à zéro', () => {
    expect(valeurAuTic(40, TICS_PAR_BOUCLE)).toBe(0);
    expect(valeurAuTic(40, TICS_PAR_BOUCLE * 3 + 5)).toBe(valeurAuTic(40, 5));
    expect(valeurAuTic(40, -1)).toBe(40);
  });
});
