// GET /api/salon/current?kind=DAMES — la partie en cours, s'il y
// en a une. Rend `{ game: null }` plutôt qu'un 404 : « pas de partie en
// cours » est une réponse normale, pas une erreur.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
// Même liste, même garde, même schéma que POST /api/salon — partagés
// plutôt que redéclarés : la copie locale ne rétrécissait pas le type et
// pouvait diverger de la liste de référence sans que rien ne le dise.
import { estUnJeu, parseEtat } from '@/lib/salon/jeux';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const kind: unknown = new URL(req.url).searchParams.get('kind');
    if (!estUnJeu(kind)) {
      return NextResponse.json(
        { error: 'INVALID_KIND', message: 'Ce jeu n’existe pas.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const couple = await findActivatedCoupleForUser(prisma, auth.user.sub);
    if (couple === null) {
      return NextResponse.json(
        { error: 'COUPLE_REQUIRED', message: 'Il faut un Espace Couple actif pour jouer.' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const trouvee = await prisma.boardGame.findFirst({
      where: { coupleId: couple.id, kind, status: 'IN_PROGRESS' },
      select: { id: true, kind: true, status: true, state: true, moveCount: true },
    });

    // L'état passe par le schéma du jeu avant de sortir : `null` plutôt
    // qu'un plateau corrompu, ce qui dit au client de repartir de la
    // position de départ — ce que `/salon/dames` fait déjà au chargement.
    //
    // `POST /api/salon` applique la même règle sur ses deux branches qui
    // lisent la base (`existante`, `gagnante`) et ne parse PAS celle qui
    // vient d'écrire `etatInitial()`. Les deux routes qui rendent une
    // partie accordent ainsi la même confiance à la base : aucune.
    const game = trouvee === null ? null : { ...trouvee, state: parseEtat(kind, trouvee.state) };

    return NextResponse.json({ game }, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}
