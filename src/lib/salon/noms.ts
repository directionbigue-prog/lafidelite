// Le nom affiché de chaque jeu du Salon.
//
// Un `Record<Jeu, …>` plutôt qu'une liste : ajouter un sixième jeu à
// `jeux.ts` sans lui donner de nom est une erreur de typage, comme pour le
// reste du registre.
import type { Jeu } from './jeux';

export const NOMS_DES_JEUX: Readonly<Record<Jeu, string>> = {
  DAMES: 'Jeu de dames',
  AWALE: 'Awalé',
  LUDO: 'Ludo',
  MOT: 'Le Mot',
  MOTS_CROISES: 'Mots croisés',
};
