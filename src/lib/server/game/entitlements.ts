// Quel palier un couple détient — la seule lecture qui décide d'un accès.
//
// POURQUOI LE COUPLE ET NON LE COMPTE. Le droit appartient à un compte
// (c'est lui qui paie), mais il ouvre les thèmes de toutes les parties du
// couple : il suffit qu'UN des deux partenaires détienne un pack.
//
// C'est un choix, et il s'écarte de celui de `free-game.ts`, qui compte la
// partie offerte par compte. La raison est que les deux choses ne sont pas
// de même nature. La partie offerte est une CONSOMMATION : un compte la
// dépense, et la dépenser deux fois serait la donner deux fois. Un pack
// achète du CONTENU, et le contenu se joue à deux sur un seul appareil —
// faire payer deux fois le même thème au même couple parce que c'est le
// téléphone de l'autre qui est allumé serait une facturation absurde, et
// le genre de règle qu'on ne découvre qu'en support.
//
// Conséquence assumée : deux comptes appariés partagent le pack de celui
// qui a payé. Un couple dissous laisse chacun avec son propre droit, ce
// qui est le comportement correct — le droit n'a jamais quitté son compte.
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import { packEffectif, packDecouverte, type Pack, type DroitAcces } from '@/lib/game/packs';

type QueryClient = PrismaClient | Prisma.TransactionClient;

/**
 * Les droits valides des deux partenaires, en UNE requête.
 *
 * Le filtre `expiresAt: { gt: maintenant }` est posé en SQL et non en
 * mémoire : un compte de longue date peut accumuler des dizaines de lignes
 * expirées, et `packEffectif` n'a pas à les voir pour trancher. Le filtre
 * `status: 'ACTIVE'` écarte en plus les droits annulés ou remboursés, dont
 * la date de fin est encore dans le futur.
 */
export async function droitsDesPartenaires(
  client: QueryClient,
  userIds: readonly string[],
  maintenant: Date,
): Promise<DroitAcces[]> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return [];

  return client.entitlement.findMany({
    where: { userId: { in: ids }, status: 'ACTIVE', expiresAt: { gt: maintenant } },
    select: { packId: true, expiresAt: true },
  });
}

/**
 * Le pack effectif d'un couple, à partir des identifiants de ses membres.
 *
 * Prend les identifiants plutôt que le `coupleId` : les routes ont déjà
 * chargé le couple pour d'autres raisons (statut ACTIVE, rôle du joueur),
 * et refaire la requête ici coûterait un aller-retour de plus dans la
 * transaction de création de partie, dont le budget est déjà la raison
 * pour laquelle `recordQuestionUsage` groupe ses écritures.
 */
export async function packDuCouple(
  client: QueryClient,
  membres: { creatorId: string; partnerId: string | null },
  maintenant: Date = new Date(),
): Promise<Pack> {
  const droits = await droitsDesPartenaires(
    client,
    [membres.creatorId, membres.partnerId].filter((id): id is string => id !== null),
    maintenant,
  );
  return packEffectif(droits, maintenant);
}

/**
 * Le pack d'un compte seul.
 *
 * Utile hors partie — un écran de compte, le back-office — là où il n'y a
 * pas de couple sous la main. Ne sert JAMAIS à décider d'un accès en
 * partie : c'est `packDuCouple` qui tranche, sinon le partenaire du payeur
 * se verrait refuser un thème que le couple a acheté.
 */
export async function packDuCompte(
  client: QueryClient,
  userId: string,
  maintenant: Date = new Date(),
): Promise<Pack> {
  if (!userId) return packDecouverte();
  const droits = await droitsDesPartenaires(client, [userId], maintenant);
  return packEffectif(droits, maintenant);
}
