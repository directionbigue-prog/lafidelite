// La forme d'un état d'Awalé, telle que le serveur l'accepte.
//
// Comme `lib/dames/etat-schema.ts`, ce schéma valide la FORME et rien
// d'autre : douze trous d'entiers positifs, deux greniers d'entiers
// positifs, un trait valide. Il ne vérifie PAS qu'un coup légal a mené à
// cette position — le moteur tourne dans le navigateur, sur un appareil
// que les deux joueurs partagent, et le serveur ne rejoue jamais la
// partie pour en juger la légalité. Ce que cette garde empêche, c'est
// qu'un état corrompu soit stocké puis fasse planter l'écran de jeu au
// chargement suivant.
//
// Une garde que les dames n'ont pas, en revanche, est à sa place ici :
// l'Awalé a une propriété de CONSERVATION que le plateau des dames n'a
// pas (les pièces disparaissent en se faisant prendre) — la somme des
// douze trous et des deux greniers vaut toujours 48. C'est encore une
// propriété de FORME, pas de légalité : aucune séquence de coups légaux
// ne peut la violer, donc un état qui y échoue n'est pas une position
// atteignable par le jeu, mais un enregistrement corrompu.
import { z } from 'zod';
import { NB_TROUS } from './etat';
import type { EtatAwale } from './etat';

const TOTAL_GRAINES = 48;

const CampSchema = z.enum(['sud', 'nord']);

export const EtatAwaleSchema = z
  .object({
    trous: z.array(z.number().int().nonnegative()).length(NB_TROUS),
    greniers: z
      .object({
        sud: z.number().int().nonnegative(),
        nord: z.number().int().nonnegative(),
      })
      .strict(),
    trait: CampSchema,
  })
  .strict()
  .refine(
    (etat) =>
      etat.trous.reduce((somme, graines) => somme + graines, 0) +
        etat.greniers.sud +
        etat.greniers.nord ===
      TOTAL_GRAINES,
    { message: `La somme des trous et des greniers doit valoir ${TOTAL_GRAINES}.` },
  );

/** `null` si la valeur n'a pas la forme d'un état — jamais une exception. */
export function parseEtatAwale(valeur: unknown): EtatAwale | null {
  const resultat = EtatAwaleSchema.safeParse(valeur);
  return resultat.success ? resultat.data : null;
}
