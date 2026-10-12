// Le test qui compte le plus dans ce lot (voir la spec) : pour chacune des
// huit grilles LIVRÉES, les neuf croisements doivent concorder, et chaque
// mot doit compter cinq lettres. `matriceLettres` fait les deux
// vérifications en les déduisant (voir son en-tête dans `etat.ts`) — ce
// test se contente de l'appeler sur les huit grilles et de s'assurer
// qu'elle ne lève jamais. Une faute de frappe dans n'importe lequel des 48
// mots casse un croisement, et ce test doit la voir : c'est vérifié à la
// main (voir le rapport de la tâche) en cassant temporairement une lettre
// de `grilles.ts`, en confirmant le rouge, puis en remettant le fichier
// exactement en état.
import { describe, expect, it } from 'vitest';
import { GRILLES } from './grilles';
import { matriceLettres } from './etat';

describe('les huit grilles livrées', () => {
  it.each(GRILLES.map((grille) => [grille.id, grille] as const))(
    'a ses neuf croisements cohérents : %s',
    (_id, grille) => {
      expect(() => matriceLettres(grille)).not.toThrow();
    },
  );

  it('compte chaque mot sur cinq lettres, dans les six mots des huit grilles', () => {
    for (const grille of GRILLES) {
      for (const { mot } of [...grille.horizontaux, ...grille.verticaux]) {
        expect([...mot], `« ${mot} » (grille « ${grille.id} »)`).toHaveLength(5);
      }
    }
  });

  it('n’a pas deux grilles avec le même identifiant', () => {
    const ids = GRILLES.map((grille) => grille.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('en propose au moins deux — sans quoi le tirage aléatoire serait toujours le même', () => {
    expect(GRILLES.length).toBeGreaterThanOrEqual(2);
  });
});
