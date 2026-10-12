// Les jeux du Salon, en un seul endroit.
//
// La liste vivait en double — `api/salon/route.ts` et
// `api/salon/current/route.ts` — avec deux implémentations divergentes de
// la même garde : l'une rétrécissait le type (`valeur is Jeu`), l'autre
// faisait un `.includes()` qui ne rétrécissait rien. Ajouter le ludo à
// l'une sans l'autre aurait donné une partie créable mais irrécupérable,
// sans qu'aucun test ne le dise.
//
// Tout ce qui doit s'étendre en même temps que `JEUX` vit donc ici, et
// chaque extension est gardée par le typecheck (voir `etatInitial`).
import { positionDepart as positionDepartDames } from '@/lib/dames/etat';
import { parseEtatPlateau } from '@/lib/dames/etat-schema';
import { positionDepart as positionDepartAwale } from '@/lib/awale/etat';
import { parseEtatAwale } from '@/lib/awale/etat-schema';
import { positionDepart as positionDepartLudo } from '@/lib/ludo/etat';
import { parseEtatLudo } from '@/lib/ludo/etat-schema';
import { positionDepart as positionDepartMot } from '@/lib/mot/etat';
import { parseEtatMot } from '@/lib/mot/etat-schema';
import { positionDepart as positionDepartMotsCroises } from '@/lib/mots-croises/etat';
import { parseEtatMotsCroises } from '@/lib/mots-croises/etat-schema';
import { GRILLES } from '@/lib/mots-croises/grilles';

/** Les jeux qui existent. */
export const JEUX = ['DAMES', 'AWALE', 'LUDO', 'MOT', 'MOTS_CROISES'] as const;
export type Jeu = (typeof JEUX)[number];

/**
 * La grille tirée au hasard pour une nouvelle partie de mots croisés.
 *
 * Le tirage vit ICI, pas dans `lib/mots-croises/etat.ts` : ce moteur
 * n'appelle jamais `Math.random()` (voir sa spec, et le commentaire de
 * `positionDepart`) — c'est à l'appelant de tirer une grille, jamais au
 * moteur de le faire lui-même. `jeux.ts` est cet appelant pour toute
 * nouvelle partie créée par `POST /api/salon`.
 */
function idGrilleAleatoire(): string {
  const grille = GRILLES[Math.floor(Math.random() * GRILLES.length)];
  if (grille === undefined) {
    throw new Error('Aucune grille de mots croisés disponible.');
  }
  return grille.id;
}

/** Rétrécit le type — c'est ce qui pilote les `switch` exhaustifs ci-dessous. */
export function estUnJeu(valeur: unknown): valeur is Jeu {
  return typeof valeur === 'string' && (JEUX as readonly string[]).includes(valeur);
}

/**
 * L'état initial du jeu demandé.
 *
 * Le `default` affecte `kind` à un `never`. Tant que chaque membre de
 * `JEUX` a son `case`, `kind` y est déjà `never` et l'affectation compile ;
 * dès qu'un jeu est ajouté sans sa position de départ, `kind` y vaut ce
 * jeu-là et `pnpm typecheck` échoue.
 *
 * C'est la garde que l'ancien commentaire promettait sans la tenir : ce
 * dépôt n'active pas `noImplicitReturns` et `undefined` est assignable à
 * `unknown`, donc un `switch` incomplet compilait en silence et écrivait
 * `state: undefined` — c'est-à-dire un 500 au premier appel.
 */
export function etatInitial(kind: Jeu): unknown {
  switch (kind) {
    case 'DAMES':
      return positionDepartDames();
    case 'AWALE':
      return positionDepartAwale();
    case 'LUDO':
      return positionDepartLudo();
    case 'MOT':
      return positionDepartMot();
    case 'MOTS_CROISES':
      return positionDepartMotsCroises(idGrilleAleatoire());
    default: {
      const inconnu: never = kind;
      throw new Error(`Jeu sans état initial : ${String(inconnu)}`);
    }
  }
}

/**
 * L'état stocké, relu selon le schéma du jeu — `null` si la base porte
 * une valeur que ce jeu ne sait pas relire.
 *
 * Même garde d'exhaustivité que `etatInitial`, et pour la même raison : un
 * jeu ajouté sans son schéma passerait sinon par le schéma des dames et
 * rendrait `null` à chaque lecture.
 */
export function parseEtat(kind: Jeu, valeur: unknown): unknown {
  switch (kind) {
    case 'DAMES':
      return parseEtatPlateau(valeur);
    case 'AWALE':
      return parseEtatAwale(valeur);
    case 'LUDO':
      return parseEtatLudo(valeur);
    case 'MOT':
      return parseEtatMot(valeur);
    case 'MOTS_CROISES':
      return parseEtatMotsCroises(valeur);
    default: {
      const inconnu: never = kind;
      throw new Error(`Jeu sans schéma d’état : ${String(inconnu)}`);
    }
  }
}
