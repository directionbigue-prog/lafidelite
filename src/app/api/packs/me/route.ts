// GET /api/packs/me — le palier du couple, tel que le serveur le voit.
//
// Existe pour que le sélecteur de thèmes grise les bonnes cartes. Le
// grisage n'est PAS la serrure : `POST /api/games` revérifie tout et
// répond 403 THEME_LOCKED. Cette route ne fait qu'éviter au joueur de
// choisir quelque chose qui lui sera refusé trois secondes plus tard.
//
// Elle renvoie le pack du COUPLE et non du compte appelant, pour la même
// raison que la route de création : il suffit qu'un des deux partenaires
// ait payé. Un écran qui afficherait le palier du compte montrerait des
// cadenas sur des thèmes que le couple a bel et bien achetés.
//
// Sans couple actif, le palier Découverte est renvoyé plutôt qu'une
// erreur : l'écran de tarifs doit pouvoir s'afficher avant l'appariement.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { packDuCouple, packDuCompte } from '@/lib/server/game/entitlements';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const couple = await findActivatedCoupleForUser(prisma, auth.user.sub);
    const pack = couple
      ? await packDuCouple(prisma, couple)
      : await packDuCompte(prisma, auth.user.sub);

    return NextResponse.json(
      {
        pack: pack.id,
        nom: pack.nom,
        // Les thèmes ouverts, pas le catalogue : l'écran n'a pas à
        // recalculer une intersection que le serveur vient de faire.
        themes: pack.themes,
        salon: pack.salon,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
