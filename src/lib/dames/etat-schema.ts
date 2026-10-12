// La forme d'un état de plateau, telle que le serveur l'accepte.
//
// Ce schéma valide la FORME et rien d'autre : 50 cases, des camps connus,
// un trait valide. Il ne vérifie PAS que la position est atteignable, ni
// que le coup qui y mène était légal — et c'est délibéré. Le moteur tourne
// dans le navigateur, sur un appareil que les deux joueurs partagent : il
// n'y a personne à tromper, chacun déplace déjà les pièces des deux camps.
// Le serveur ne conserve le plateau que pour la reprise.
//
// Ce que cette garde empêche, en revanche, c'est qu'un état corrompu soit
// stocké puis fasse planter l'écran de jeu au chargement suivant.
import { z } from 'zod';
import { NB_CASES } from './plateau';
import type { EtatPlateau } from './etat';

const CampSchema = z.enum(['blanc', 'noir']);

const CaseSchema = z
  .object({
    camp: CampSchema,
    dame: z.boolean(),
  })
  .strict()
  .nullable();

export const EtatPlateauSchema = z
  .object({
    cases: z.array(CaseSchema).length(NB_CASES),
    trait: CampSchema,
  })
  .strict();

/** `null` si la valeur n'a pas la forme d'un état — jamais une exception. */
export function parseEtatPlateau(valeur: unknown): EtatPlateau | null {
  const resultat = EtatPlateauSchema.safeParse(valeur);
  return resultat.success ? resultat.data : null;
}
