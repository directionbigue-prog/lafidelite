// GET /api/rituel — la série, les badges et le journal des souvenirs.
//
// Lecture seule, dérivée de l'activité à chaque appel : rien de tout cela
// n'est stocké (voir `lib/rituel/serie.ts` et `badges.ts` pour le pourquoi).
// Ne renvoie que des jours, des comptes et des titres — jamais une réponse.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { chargerActivite, trouverCoupleRituel } from '@/lib/server/rituel/activite';
import { etatDesBadges, joursActifs, souvenirs } from '@/lib/rituel/badges';
import { calculerSerie } from '@/lib/rituel/serie';
import { jourDe } from '@/lib/rituel/jour';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const couple = await trouverCoupleRituel(prisma, auth.user.sub);
    if (!couple) {
      return NextResponse.json(
        { error: 'NO_ACTIVE_COUPLE', message: 'You do not belong to an active Espace Couple.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const aujourdhui = jourDe(new Date());
    const activite = await chargerActivite(prisma, couple);
    const badges = etatDesBadges(activite);

    return NextResponse.json(
      {
        aujourdhui,
        serie: calculerSerie(joursActifs(activite), aujourdhui),
        badges,
        souvenirs: souvenirs(activite, badges),
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
