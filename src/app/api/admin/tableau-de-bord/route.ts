// GET /api/admin/tableau-de-bord — tout le produit en un coup d'œil.
//
// SUPERADMIN seulement : le chiffre d'affaires et la santé des files sont des
// chiffres de direction, pas d'exploitation. Lecture seule, donc rien à
// auditer (`logAdminAction` est réservé aux mutations).
//
// La route COMPTE en base ; les calculs (séries par jour, ventes par pack,
// pourcentages) vivent dans lib/admin/tableau-de-bord.ts, testé sans base.
// Rien n'est mis en cache : un tableau de bord qui ment de dix minutes au
// moment d'un incident est pire qu'une requête un peu lente.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { DOMAINE_INVITE } from '@/lib/couples/compte-invite';
import {
  compteParCle,
  jourUtc,
  packDeCommande,
  serieQuotidienne,
  ventesParPack,
} from '@/lib/admin/tableau-de-bord';

const JOUR_MS = 24 * 60 * 60 * 1000;
const FENETRE_JOURS = 14;

type Groupe = { _count: { _all: number } };
function groupes<T extends Groupe>(rows: T[], cle: (r: T) => string | null) {
  return rows.map((r) => ({ cle: cle(r), n: r._count._all }));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('SUPERADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const maintenant = new Date();
    const il7j = new Date(maintenant.getTime() - 7 * JOUR_MS);
    const il30j = new Date(maintenant.getTime() - 30 * JOUR_MS);
    const debutFenetre = new Date(maintenant.getTime() - FENETRE_JOURS * JOUR_MS);
    const aujourdhui = jourUtc(maintenant);

    const [
      comptesTotal,
      comptesInvites,
      comptesNouveaux7j,
      comptesNouveaux30j,
      comptesSuspendus,
      partiesOffertesJouees,
      couplesParStatut,
      partiesParStatut,
      partiesTerminees7j,
      niveaux,
      salonParJeu,
      reponsesDuJour,
      reponses7j,
      commandesParStatut,
      commandesPayees,
      droitsActifs,
      droitsAvecCommande,
      emailsParStatut,
      outboxParStatut,
      connexions7j,
      inscriptionsFenetre,
      partiesFenetre,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { email: { endsWith: `@${DOMAINE_INVITE}` } } }),
      prisma.user.count({ where: { createdAt: { gte: il7j } } }),
      prisma.user.count({ where: { createdAt: { gte: il30j } } }),
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
      prisma.user.count({ where: { freeGameUsedAt: { not: null } } }),
      prisma.couple.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.gameSession.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.gameSession.count({ where: { status: 'COMPLETED', completedAt: { gte: il7j } } }),
      prisma.gameResult.groupBy({ by: ['complicityLevel'], _count: { _all: true } }),
      prisma.boardGame.groupBy({ by: ['kind', 'status'], _count: { _all: true } }),
      prisma.reponseDuJour.groupBy({
        by: ['coupleId'],
        where: { jour: aujourdhui },
        _count: { _all: true },
      }),
      prisma.reponseDuJour.count({ where: { createdAt: { gte: il7j } } }),
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.order.findMany({
        where: { status: 'PAID' },
        select: {
          id: true,
          amount: true,
          currency: true,
          metadata: true,
          paidAt: true,
          paymentMethod: true,
        },
        orderBy: { paidAt: 'desc' },
        take: 5000,
      }),
      prisma.entitlement.groupBy({
        by: ['packId'],
        where: { status: 'ACTIVE', expiresAt: { gt: maintenant } },
        _count: { _all: true },
      }),
      prisma.entitlement.findMany({
        where: { orderId: { not: null } },
        select: { orderId: true },
      }),
      prisma.emailJob.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.outboxEvent.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.connexionEvent.findMany({
        where: { createdAt: { gte: il7j } },
        select: { appareil: true, pays: true },
      }),
      prisma.user.findMany({
        where: { createdAt: { gte: debutFenetre } },
        select: { createdAt: true },
      }),
      prisma.gameSession.findMany({
        where: { status: 'COMPLETED', completedAt: { gte: debutFenetre } },
        select: { completedAt: true },
      }),
    ]);

    const parties = compteParCle(
      groupes(partiesParStatut, (r) => r.status),
      ['IN_PROGRESS', 'COMPLETED', 'ABANDONED'],
    );
    const commandes = compteParCle(
      groupes(commandesParStatut, (r) => r.status),
      ['PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED'],
    );

    // Le Salon : un total et un « en cours » par jeu.
    const salon = new Map<string, { total: number; enCours: number }>();
    for (const g of salonParJeu) {
      const courant = salon.get(g.kind) ?? { total: 0, enCours: 0 };
      courant.total += g._count._all;
      if (g.status === 'IN_PROGRESS') courant.enCours += g._count._all;
      salon.set(g.kind, courant);
    }

    // Une commande de pack payée sans droit ouvert : l'incident qui compte le
    // plus, car le client a payé et ne peut pas jouer.
    const commandesAvecDroit = new Set(droitsAvecCommande.map((d) => d.orderId));
    const payeesSansDroit = commandesPayees.filter(
      (c) => packDeCommande(c.metadata) !== 'AUTRE' && !commandesAvecDroit.has(c.id),
    );

    const montantTotal = commandesPayees.reduce((s, c) => s + c.amount, 0);
    const montant30j = commandesPayees
      .filter((c) => c.paidAt && c.paidAt >= il30j)
      .reduce((s, c) => s + c.amount, 0);

    const emails = compteParCle(
      groupes(emailsParStatut, (r) => r.status),
      ['PENDING', 'SENT', 'FAILED', 'DEAD'],
    );
    const outbox = compteParCle(
      groupes(outboxParStatut, (r) => r.status),
      ['PENDING', 'SENT', 'FAILED', 'DEAD'],
    );

    const parAppareil: Record<string, number> = {};
    const parPays: Record<string, number> = {};
    for (const c of connexions7j) {
      parAppareil[c.appareil] = (parAppareil[c.appareil] ?? 0) + 1;
      const pays = c.pays ?? 'Inconnu';
      parPays[pays] = (parPays[pays] ?? 0) + 1;
    }

    return NextResponse.json(
      {
        genereLe: maintenant.toISOString(),
        comptes: {
          total: comptesTotal,
          invites: comptesInvites,
          nouveaux7j: comptesNouveaux7j,
          nouveaux30j: comptesNouveaux30j,
          suspendus: comptesSuspendus,
        },
        couples: compteParCle(
          groupes(couplesParStatut, (r) => r.status),
          ['PENDING', 'ACTIVE', 'DISSOLVED'],
        ),
        parties: {
          parStatut: parties,
          terminees7j: partiesTerminees7j,
          partiesOffertesJouees,
          niveaux: compteParCle(groupes(niveaux, (r) => r.complicityLevel)),
        },
        salon: [...salon.entries()].map(([jeu, v]) => ({ jeu, ...v })),
        rituel: {
          couplesAujourdhui: reponsesDuJour.length,
          couplesCompletsAujourdhui: reponsesDuJour.filter((g) => g._count._all >= 2).length,
          reponses7j,
        },
        ventes: {
          commandes,
          montantTotal,
          montant30j,
          devise: 'FCFA',
          parPack: ventesParPack(commandesPayees),
          droitsActifs: compteParCle(groupes(droitsActifs, (r) => r.packId)),
          derniers: commandesPayees.slice(0, 10).map((c) => ({
            id: c.id,
            montant: c.amount,
            packId: packDeCommande(c.metadata),
            methode: c.paymentMethod,
            payeeLe: c.paidAt ? c.paidAt.toISOString() : null,
          })),
        },
        files: { emails, outbox },
        connexions7j: { total: connexions7j.length, parAppareil, parPays },
        alertes: {
          payeesSansDroit: payeesSansDroit.map((c) => c.id),
          emailsMorts: emails.DEAD ?? 0,
          outboxMorts: outbox.DEAD ?? 0,
          emailsEnAttente: emails.PENDING ?? 0,
        },
        series: {
          inscriptions: serieQuotidienne(
            inscriptionsFenetre.map((u) => ({ date: u.createdAt })),
            FENETRE_JOURS,
            maintenant,
          ),
          parties: serieQuotidienne(
            partiesFenetre.flatMap((p) => (p.completedAt ? [{ date: p.completedAt }] : [])),
            FENETRE_JOURS,
            maintenant,
          ),
          ventes: serieQuotidienne(
            commandesPayees.flatMap((c) =>
              c.paidAt && c.paidAt >= debutFenetre ? [{ date: c.paidAt, valeur: c.amount }] : [],
            ),
            FENETRE_JOURS,
            maintenant,
          ),
        },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
