// Le compteur du téléphone de fin de partie, dans le héros de l'accueil.
//
// Repris du canevas Claude Design du 16/10/2026, qui le faisait tourner dans
// son `DCLogic` : un tic toutes les 100 ms, une boucle de 60 tics, et une
// montée de 0 à la cible sur les 15 premiers, en « ease-out » cubique (vite
// au départ, lentement à l'arrivée, comme un score qu'on additionne).
//
// La règle vit ici et non dans `components/landing/CompteurScore.tsx` : ce
// dépôt n'a pas de jsdom, un composant ne s'y monte pas, une fonction pure
// se teste.

/** Durée d'un tic, en millisecondes. */
export const DUREE_DU_TIC_MS = 100;

/** Une boucle complète : 60 tics, soit 6 secondes. */
export const TICS_PAR_BOUCLE = 60;

/** La montée dure 15 tics (1,5 s) ; le chiffre reste ensuite affiché. */
export const TICS_DE_MONTEE = 15;

/**
 * La valeur affichée au tic `tic`, pour une boucle qui mène à `cible`.
 *
 * `tic` peut dépasser la boucle ou être négatif : il est ramené dedans, si
 * bien que l'appelant n'a qu'à l'incrémenter sans jamais le remettre à zéro.
 */
export function valeurAuTic(cible: number, tic: number): number {
  const t = ((tic % TICS_PAR_BOUCLE) + TICS_PAR_BOUCLE) % TICS_PAR_BOUCLE;
  if (t >= TICS_DE_MONTEE) return cible;
  return Math.round(cible * (1 - Math.pow(1 - t / TICS_DE_MONTEE, 3)));
}
