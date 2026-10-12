// La forme d'un état de Ludo, telle que le serveur l'accepte.
//
// Comme `lib/dames/etat-schema.ts` et `lib/awale/etat-schema.ts`, ce
// schéma valide la FORME et rien d'autre : quatre pions par camp dans des
// bornes valides, un dé absent ou compris entre 1 et 6, un trait valide.
// Il ne vérifie PAS qu'une séquence de coups légaux a mené à cette
// position — le moteur tourne dans le navigateur, sur l'appareil que les
// deux joueurs partagent, et le serveur ne rejoue jamais la partie pour en
// juger la légalité. Ce que cette garde empêche, c'est qu'un état corrompu
// soit stocké puis fasse planter l'écran de jeu au chargement suivant.
import { z } from 'zod';
import type { EtatLudo } from './etat';
import { TAILLE_CIRCUIT, TAILLE_COLONNE } from './plateau';

const CampSchema = z.enum(['sud', 'nord']);

const PionSchema = z.discriminatedUnion('zone', [
  z.object({ zone: z.literal('enclos') }).strict(),
  z
    .object({
      zone: z.literal('circuit'),
      progression: z
        .number()
        .int()
        .min(0)
        .max(TAILLE_CIRCUIT - 1),
    })
    .strict(),
  z
    .object({
      zone: z.literal('colonne'),
      progression: z
        .number()
        .int()
        .min(0)
        .max(TAILLE_COLONNE - 1),
    })
    .strict(),
  z.object({ zone: z.literal('arrivee') }).strict(),
]);

const QuatrePionsSchema = z.tuple([PionSchema, PionSchema, PionSchema, PionSchema]);

export const EtatLudoSchema = z
  .object({
    pions: z
      .object({
        sud: QuatrePionsSchema,
        nord: QuatrePionsSchema,
      })
      .strict(),
    trait: CampSchema,
    de: z.union([z.null(), z.number().int().min(1).max(6)]),
    // Compteur des six d'affilée déjà lancés dans le cycle en cours : 0,
    // 1 ou 2 seulement — un état où il vaudrait 3 n'a jamais pu être
    // produit par le moteur, `lancerDe` bascule toujours le trait et remet
    // le compteur à 0 avant qu'il puisse atteindre cette valeur.
    sixDAffilee: z.number().int().min(0).max(2),
  })
  .strict();

/** `null` si la valeur n'a pas la forme d'un état — jamais une exception. */
export function parseEtatLudo(valeur: unknown): EtatLudo | null {
  const resultat = EtatLudoSchema.safeParse(valeur);
  return resultat.success ? resultat.data : null;
}
