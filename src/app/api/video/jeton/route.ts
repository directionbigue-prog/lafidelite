// POST /api/video/jeton — entrer dans la salle vidéo du couple.
//
// Rend `{ url, token }` : l'adresse de la salle Daily privée du couple
// (créée au premier appel) et un jeton nominatif qui expire. Réservé aux
// membres d'un couple ACTIF : un couple sans partenaire n'a personne à voir.
//
// GET /api/video/jeton — `{ disponible }`, pour que l'écran sache s'il peut
// proposer le bouton sans dépenser un jeton.
//
// POST et non GET pour le jeton : il crée potentiellement une salle chez
// Daily, et un GET ne doit rien créer.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { findActivatedCoupleForUser } from '@/lib/server/couples/queries';
import { dailyConfigure, jetonPour, salleDuCouple } from '@/lib/server/video/daily';

const log = createLogger();

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }
    // Disponible = la vidéo est configurée ET il y a quelqu'un à appeler. Le
    // bouton s'affichait pour tout compte, y compris sans couple actif (le
    // super-admin, un couple en attente) : le clic menait à une erreur.
    let disponible = dailyConfigure();
    if (disponible) {
      const couple = await findActivatedCoupleForUser(prisma, auth.user.sub);
      disponible = Boolean(couple?.partnerId);
    }
    return NextResponse.json(
      { disponible },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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

    if (!dailyConfigure()) {
      return NextResponse.json(
        { error: 'VIDEO_NOT_CONFIGURED', message: 'Video calls are not configured.' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const couple = await findActivatedCoupleForUser(prisma, auth.user.sub);
    if (!couple || !couple.partnerId) {
      return NextResponse.json(
        { error: 'NO_ACTIVE_COUPLE', message: 'You do not belong to an active Espace Couple.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const moi = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: { name: true },
    });

    try {
      const url = await salleDuCouple(couple.id);
      const token = await jetonPour(couple.id, {
        id: auth.user.sub,
        nom: moi?.name?.trim() || 'Moi',
      });
      return NextResponse.json(
        { url, token },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      log.error('video: Daily a refusé la salle ou le jeton', {
        requestId: ctx.requestId,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: 'VIDEO_UNAVAILABLE', message: 'The video provider is unavailable.' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }
  });
}
