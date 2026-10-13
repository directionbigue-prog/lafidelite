// POST /api/salon/[id]/end — terminer ou abandonner.
//
// Sûre à rejouer : le `where` filtre sur IN_PROGRESS, donc un second appel
// ne fait rien et répond quand même 200. Le client peut donc réessayer
// sans avoir à distinguer les cas.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { partiesDe, proprietaireDuSalon } from '@/lib/server/salon/proprietaire';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const ISSUES = ['COMPLETED', 'ABANDONED'] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', ctx.requestId);
      return csrfFail;
    }

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const { id } = await params;
    const body: unknown = await req.json().catch(() => null);
    const outcome = (body as { outcome?: unknown } | null)?.outcome;
    if (typeof outcome !== 'string' || !(ISSUES as readonly string[]).includes(outcome)) {
      return NextResponse.json(
        { error: 'INVALID_OUTCOME', message: 'Issue inconnue.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Le couple actif, ou l'appelant seul — même résolution que POST.
    const proprietaire = await proprietaireDuSalon(prisma, auth.user.sub);
    const siennes = partiesDe(proprietaire);

    const partie = await prisma.boardGame.findFirst({
      where: { id, ...siennes },
      select: { id: true },
    });
    if (partie === null) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Partie introuvable.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Le propriétaire (`siennes` : le `coupleId`, ou le `userId` d'un compte
    // seul) dans le `where` de l'écriture, comme dans celui de la
    // lecture ci-dessus : `id` est la clé primaire et rien ne réaffecte un
    // `coupleId`, donc ce n'est pas une faille — c'est une écriture qui ne
    // dépend plus du `findFirst` qui la précède pour être correcte. C'est
    // ce motif-là qui sera recopié pour le prochain jeu.
    await prisma.boardGame.updateMany({
      where: { id, ...siennes, status: 'IN_PROGRESS' },
      data: { status: outcome, endedAt: new Date() },
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
