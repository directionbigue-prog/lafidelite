// Perft — le compteur de nœuds qui valide le générateur de coups.
//
// Emprunté aux moteurs d'échecs : on compte les feuilles de l'arbre des
// coups légaux à une profondeur donnée, et on compare à des valeurs
// publiées. Une seule unité d'écart trahit une règle fausse, et la
// profondeur où l'écart apparaît indique laquelle : une erreur sur les
// déplacements simples se voit dès la profondeur 1, une erreur de rafle
// vers 4-5, un défaut de déduplication seulement à partir de 8.
//
// Ce module ne sert qu'aux tests. Il reste dans `src/` plutôt que dans un
// dossier de test parce qu'il fait partie du moteur : c'est son
// instrument de mesure.
import { coupsLegaux } from './coups';
import { appliquer } from './partie';
import type { EtatPlateau } from './etat';

export function perft(etat: EtatPlateau, profondeur: number): number {
  if (profondeur === 0) return 1;
  const coups = coupsLegaux(etat);
  // Raccourci : à la profondeur 1, les feuilles sont les coups eux-mêmes.
  // Économise autant d'appels à `appliquer` qu'il y a de coups.
  if (profondeur === 1) return coups.length;

  let total = 0;
  for (const coup of coups) {
    total += perft(appliquer(etat, coup), profondeur - 1);
  }
  return total;
}
