// À qui appartiennent les parties du Salon de l'appelant.
//
// Jusqu'au 13/10/2026, au couple ACTIF seulement : un compte sans partenaire
// recevait `COUPLE_REQUIRED` et ne pouvait pas jouer. Or le Salon, à la
// différence du jeu du couple, n'a besoin de personne en face dans l'app — on
// y joue à deux sur UN appareil, avec qui est assis à côté. Rien n'y est
// secret et rien n'y compte pour le couple, donc rien n'exige que l'autre
// joueur ait un compte.
//
// D'où deux propriétaires possibles, jamais les deux à la fois (contrainte
// CHECK `BoardGame_un_seul_proprietaire`) :
//   - le couple, s'il est ACTIF — comportement inchangé ;
//   - sinon le compte lui-même, partie rangée sous `userId`.
//
// Les quatre routes du Salon passent TOUTES par ce module : une route qui
// filtrerait encore sur `coupleId` seul laisserait un compte solo créer une
// partie qu'il ne pourrait ni sauvegarder ni terminer.
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { packDuCouple } from '@/lib/server/game/entitlements';
import type { Pack } from '@/lib/game/packs';

type QueryClient = PrismaClient | Prisma.TransactionClient;

export type ProprietaireSalon =
  | {
      readonly genre: 'couple';
      readonly coupleId: string;
      readonly creatorId: string;
      readonly partnerId: string | null;
    }
  | { readonly genre: 'solo'; readonly userId: string };

/** Le couple actif de l'appelant, ou l'appelant seul s'il n'en a pas. */
export async function proprietaireDuSalon(
  client: QueryClient,
  userId: string,
): Promise<ProprietaireSalon> {
  const couple = await findActivatedCoupleForUser(client, userId);
  if (couple === null) return { genre: 'solo', userId };
  return {
    genre: 'couple',
    coupleId: couple.id,
    creatorId: couple.creatorId,
    partnerId: couple.partnerId,
  };
}

/**
 * Le filtre à poser dans le `where` de TOUTE lecture et de toute écriture.
 *
 * `coupleId: null` dans la branche solo est redondant avec la contrainte
 * CHECK, et c'est voulu : le filtre se défend seul, sans dépendre de ce que
 * la base garantit par ailleurs.
 */
export function partiesDe(
  proprietaire: ProprietaireSalon,
): { coupleId: string } | { userId: string; coupleId: null } {
  return proprietaire.genre === 'couple'
    ? { coupleId: proprietaire.coupleId }
    : { userId: proprietaire.userId, coupleId: null };
}

/** Ce qu'une création écrit comme propriétaire — une seule des deux colonnes. */
export function proprietaireAEcrire(
  proprietaire: ProprietaireSalon,
): { coupleId: string } | { userId: string } {
  return proprietaire.genre === 'couple'
    ? { coupleId: proprietaire.coupleId }
    : { userId: proprietaire.userId };
}

/**
 * Le pack qui décide de l'accès au Salon.
 *
 * Pour un couple, celui du couple — l'un des deux suffit. Pour un compte
 * seul, le sien : il n'y a personne d'autre dont le pack pourrait compter.
 * Même règle de prix dans les deux cas : le Salon reste inclus dans les
 * packs payants, et seulement eux.
 */
export function packDuProprietaire(
  client: QueryClient,
  proprietaire: ProprietaireSalon,
  maintenant: Date = new Date(),
): Promise<Pack> {
  const membres =
    proprietaire.genre === 'couple'
      ? { creatorId: proprietaire.creatorId, partnerId: proprietaire.partnerId }
      : { creatorId: proprietaire.userId, partnerId: null };
  return packDuCouple(client, membres, maintenant);
}
