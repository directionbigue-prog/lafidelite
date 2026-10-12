// La forme d'un état du Mot, telle que le serveur l'accepte.
//
// Comme les schémas des trois autres jeux du Salon, celui-ci valide la
// FORME et rien d'autre : un mot de cinq lettres (ou son absence), des
// tentatives de cinq lettres et au plus six par manche, un proposeur et un
// devineur distincts, une ou deux manches. Il ne vérifie JAMAIS qu'un mot
// ou une tentative existe dans le dictionnaire, ni qu'une tentative a été
// consommée à bon droit, ni que la seconde manche échange bien les
// rôles — le moteur tourne dans le navigateur, sur un appareil que les
// deux joueurs partagent, et le serveur ne rejoue jamais la partie pour en
// juger la légalité. Ce que cette garde empêche, c'est qu'un état corrompu
// soit stocké puis fasse planter l'écran de jeu au chargement suivant.
//
// Ce jeu n'a pas de champ `trait` (voir `etat.ts`) : l'équivalent qui se
// vérifie ici est que `proposeur` et `devineur` soient deux joueurs
// DIFFÉRENTS — sans quoi une manche n'aurait ni proposeur ni devineur
// réels.
import { z } from 'zod';
import { LONGUEUR_MOT, TENTATIVES_MAX } from './etat';
import type { EtatMot } from './etat';

const JoueurSchema = z.enum(['un', 'deux']);

/**
 * Cinq lettres, en minuscules — la forme que produit `normaliserMot`.
 * `\p{L}` (catégorie Unicode "lettre") plutôt qu'une plage `a-z` écrite à
 * la main : le dictionnaire porte des lettres accentuées (voir
 * `dictionnaire.ts`), et une plage ASCII les aurait toutes rejetées.
 */
const MotSchema = z
  .string()
  .refine(
    (mot) => [...mot].length === LONGUEUR_MOT && /^\p{L}+$/u.test(mot) && mot === mot.toLowerCase(),
    { message: `Un mot doit compter exactement ${LONGUEUR_MOT} lettres, en minuscules.` },
  );

const MancheSchema = z
  .object({
    proposeur: JoueurSchema,
    devineur: JoueurSchema,
    mot: MotSchema.nullable(),
    tentatives: z.array(MotSchema).max(TENTATIVES_MAX),
  })
  .strict()
  .refine((manche) => manche.proposeur !== manche.devineur, {
    message: 'Le proposeur et le devineur doivent être deux joueurs différents.',
  });

export const EtatMotSchema = z
  .object({
    manches: z.array(MancheSchema).min(1).max(2),
  })
  .strict();

/** `null` si la valeur n'a pas la forme d'un état — jamais une exception. */
export function parseEtatMot(valeur: unknown): EtatMot | null {
  const resultat = EtatMotSchema.safeParse(valeur);
  return resultat.success ? resultat.data : null;
}
