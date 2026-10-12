// Shared "does this user already have an active Espace Couple" check.
// Used by both POST /api/couples (create) and POST /api/couples/join —
// a user may be creator or partner of at most one PENDING/ACTIVE couple
// at a time (PRD §9 R1: "un seul utilisateur ne peut appartenir qu'à un
// seul Espace Couple actif").
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';

type QueryClient = PrismaClient | Prisma.TransactionClient;

export async function findActiveCoupleForUser(
  client: QueryClient,
  userId: string,
): Promise<{ id: string } | null> {
  return client.couple.findFirst({
    where: {
      status: { in: ['PENDING', 'ACTIVE'] },
      OR: [{ creatorId: userId }, { partnerId: userId }],
    },
    select: { id: true },
  });
}

export interface ActivatedCouple {
  id: string;
  creatorId: string;
  partnerId: string | null;
  disclaimerAcceptedByCreatorAt: Date | null;
  disclaimerAcceptedByPartnerAt: Date | null;
  cumulativeCoupleScore: number;
}

// Strict variant for the game engine (Lot 2's /api/games/* routes): a
// PENDING couple (no partner joined yet) is deliberately NOT eligible to
// start a game, unlike findActiveCoupleForUser above which treats
// PENDING/ACTIVE as equally "the user's couple" for pairing-flow purposes.
export async function findActivatedCoupleForUser(
  client: QueryClient,
  userId: string,
): Promise<ActivatedCouple | null> {
  return client.couple.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [{ creatorId: userId }, { partnerId: userId }],
    },
    select: {
      id: true,
      creatorId: true,
      partnerId: true,
      disclaimerAcceptedByCreatorAt: true,
      disclaimerAcceptedByPartnerAt: true,
      cumulativeCoupleScore: true,
    },
  });
}
