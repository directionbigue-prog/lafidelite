// GET /api/orders/[id] — l'état d'une commande, pour l'écran de retour de
// paiement (/paiement/[id]).
//
// Bictorys renvoie le client sur ce site avant, parfois, que son webhook soit
// arrivé : l'écran relit donc cette route jusqu'à voir PAID (et le pack
// ouvert) plutôt que d'annoncer un succès qu'il ne peut pas encore prouver.
//
// Lecture seule et limitée au propriétaire : la commande d'un autre compte
// répond 404, pas 403, pour ne pas révéler qu'elle existe.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await routeCtx.params;
    // `derniere` = la commande la plus récente du compte : c'est l'URL fixe
    // qu'un tableau de bord de prestataire peut porter, quand il ne sait pas
    // renvoyer l'identifiant de la commande.
    const order = await prisma.order.findFirst({
      where: id === 'derniere' ? { userId: auth.user.sub } : { id, userId: auth.user.sub },
      ...(id === 'derniere' ? { orderBy: { createdAt: 'desc' as const } } : {}),
      select: { id: true, status: true, amount: true, currency: true, metadata: true },
    });
    if (!order) {
      return NextResponse.json(
        { error: 'ORDER_NOT_FOUND', message: 'Order not found.' },
        { status: 404, headers },
      );
    }

    const droit = await prisma.entitlement.findUnique({
      where: { orderId: order.id },
      select: { packId: true, expiresAt: true, status: true },
    });
    const meta = order.metadata as { packId?: unknown } | null;

    return NextResponse.json(
      {
        id: order.id,
        status: order.status,
        amount: order.amount,
        currency: order.currency,
        packId: typeof meta?.packId === 'string' ? meta.packId : null,
        droit: droit
          ? {
              packId: droit.packId,
              status: droit.status,
              expiresAt: droit.expiresAt.toISOString(),
            }
          : null,
      },
      { status: 200, headers },
    );
  });
}
