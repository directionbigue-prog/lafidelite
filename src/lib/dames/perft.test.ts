import { describe, expect, it } from 'vitest';
import { perft } from './perft';
import { positionDepart } from './etat';

// Valeurs de référence relevées sur le forum de la fédération mondiale
// (https://damforum.nl/viewtopic.php?t=2308), publiées par Ed Gilbert,
// auteur de Kingsrow. Ce ne sont PAS des valeurs de non-régression
// produites par ce moteur : elles lui sont extérieures, et c'est ce qui
// leur donne leur valeur. Ne jamais les « corriger » pour faire passer le
// test — un écart signale une règle fausse, pas une valeur fausse.
const REFERENCE: readonly [profondeur: number, noeuds: number][] = [
  [1, 9],
  [2, 81],
  [3, 658],
  [4, 4265],
  [5, 27117],
];

describe('perft depuis la position de départ', () => {
  for (const [profondeur, noeuds] of REFERENCE) {
    it(`compte ${noeuds} nœuds à la profondeur ${profondeur}`, () => {
      expect(perft(positionDepart(), profondeur)).toBe(noeuds);
    });
  }

  // Sortis de la boucle : ils explorent respectivement 167 140 et 1 049 442
  // feuilles et dépassent le délai par défaut de Vitest. La profondeur 7 est
  // le dernier palier abordable dans une suite quotidienne : c'est la zone
  // où la déduplication des rafles commence à compter (deux moteurs de
  // référence divergent typiquement à partir de perft(8) sur cette règle).
  it('compte 167 140 nœuds à la profondeur 6', { timeout: 60_000 }, () => {
    expect(perft(positionDepart(), 6)).toBe(167140);
  });

  it('compte 1 049 442 nœuds à la profondeur 7', { timeout: 60_000 }, () => {
    expect(perft(positionDepart(), 7)).toBe(1049442);
  });
});
