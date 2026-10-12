// Charge l'activité d'un couple, sous la forme que lisent la série et les
// badges (`lib/rituel/badges.ts`).
//
// Deux requêtes en parallèle, pas de jointure profonde : les parties
// terminées avec le niveau de leur résultat, et les réponses du jour. Rien
// de ce qui sort d'ici ne porte une réponse — seulement des jours, des
// niveaux et un booléen « chacun a deviné l'autre ».
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import type { Activite } from '@/lib/rituel/badges';
import { jourDe } from '@/lib/rituel/jour';
import { revelation } from '@/lib/rituel/question-du-jour';

export interface CoupleRituel {
  id: string;
  creatorId: string;
  pairedAt: Date | null;
  creatorName: string | null;
  partnerName: string | null;
}

/**
 * Le couple ACTIF de ce compte, avec ce que le rituel affiche (les deux
 * prénoms, la date de naissance de l'Espace). ACTIVE seulement, comme le
 * moteur de jeu : un couple sans partenaire n'a personne à qui poser la
 * question du jour.
 */
export async function trouverCoupleRituel(
  prisma: PrismaClient,
  userId: string,
): Promise<CoupleRituel | null> {
  const c = await prisma.couple.findFirst({
    where: { status: 'ACTIVE', OR: [{ creatorId: userId }, { partnerId: userId }] },
    select: {
      id: true,
      creatorId: true,
      pairedAt: true,
      creator: { select: { name: true } },
      partner: { select: { name: true } },
    },
  });
  if (!c) return null;
  return {
    id: c.id,
    creatorId: c.creatorId,
    pairedAt: c.pairedAt,
    creatorName: c.creator.name,
    partnerName: c.partner?.name ?? null,
  };
}

export async function chargerActivite(
  prisma: PrismaClient,
  couple: { id: string; pairedAt: Date | null },
): Promise<Activite> {
  const [sessions, reponses] = await Promise.all([
    prisma.gameSession.findMany({
      where: { coupleId: couple.id, status: 'COMPLETED', completedAt: { not: null } },
      select: { completedAt: true, result: { select: { complicityLevel: true } } },
      orderBy: { completedAt: 'asc' },
    }),
    prisma.reponseDuJour.findMany({
      where: { coupleId: couple.id },
      select: { jour: true, role: true, choixPropre: true, choixDevine: true },
      orderBy: { jour: 'asc' },
    }),
  ]);

  const parties = sessions.map((s) => ({
    jour: jourDe(s.completedAt as Date),
    niveau: s.result?.complicityLevel ?? 'DECOUVERTE',
  }));

  const parJour = new Map<string, typeof reponses>();
  for (const r of reponses) {
    const liste = parJour.get(r.jour) ?? [];
    liste.push(r);
    parJour.set(r.jour, liste);
  }
  const quotidiennes: Activite['quotidiennes'][number][] = [];
  for (const [jour, lignes] of [...parJour.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const { revele } = revelation(lignes);
    // Un jour où un seul a répondu ne compte pas : le rituel est à deux.
    if (revele) quotidiennes.push({ jour, telepathie: revele.telepathie });
  }

  return {
    forme: couple.pairedAt ? jourDe(couple.pairedAt) : null,
    parties,
    quotidiennes,
  };
}
