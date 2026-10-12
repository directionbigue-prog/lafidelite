// La forme d'un état de mots croisés, telle que le serveur l'accepte.
//
// Comme les schémas des quatre autres jeux du Salon, celui-ci valide la
// FORME et rien d'autre : un identifiant de grille CONNU, des mots trouvés
// dont l'emplacement existe bien dans une grille (chaque grille a
// exactement les mêmes six emplacements — trois horizontaux, trois
// verticaux, voir `etat.ts`), sans doublon, un trait valide, un compteur de
// passages dans les bornes. Il ne vérifie JAMAIS qu'une proposition a été
// jugée à bon droit, ni que le score qu'on pourrait en déduire est
// atteignable, ni que l'alternance des tours a été respectée — le moteur
// tourne dans le navigateur, sur un appareil que les deux joueurs
// partagent, et le serveur ne rejoue jamais la partie pour en juger la
// légalité. Ce que cette garde empêche, c'est qu'un état corrompu soit
// stocké puis fasse planter l'écran de jeu au chargement suivant.
import { z } from 'zod';
import { GRILLES } from './grilles';
import type { EtatMotsCroises } from './etat';

const JoueurSchema = z.enum(['un', 'deux']);
const DirectionSchema = z.enum(['horizontal', 'vertical']);
const IndexMotSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

const MotTrouveSchema = z
  .object({
    direction: DirectionSchema,
    index: IndexMotSchema,
    trouvePar: JoueurSchema,
  })
  .strict();

export const EtatMotsCroisesSchema = z
  .object({
    idGrille: z.string().refine((id) => GRILLES.some((grille) => grille.id === id), {
      message: 'Grille de mots croisés inconnue.',
    }),
    trouves: z.array(MotTrouveSchema).max(6),
    trait: JoueurSchema,
    passesConsecutifs: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  })
  .strict()
  .refine(
    (etat) => {
      const vus = new Set<string>();
      for (const trouve of etat.trouves) {
        const cle = `${trouve.direction}-${trouve.index}`;
        if (vus.has(cle)) return false;
        vus.add(cle);
      }
      return true;
    },
    { message: 'Un même emplacement ne peut pas figurer deux fois parmi les mots trouvés.' },
  );

/** `null` si la valeur n'a pas la forme d'un état — jamais une exception. */
export function parseEtatMotsCroises(valeur: unknown): EtatMotsCroises | null {
  const resultat = EtatMotsCroisesSchema.safeParse(valeur);
  return resultat.success ? resultat.data : null;
}
