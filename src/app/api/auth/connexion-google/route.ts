// GET /api/auth/connexion-google?next=… — le relais qui compte les connexions
// Google, puis renvoie là où la personne allait.
//
// Le retour OAuth de Google (protégé, inchangé) émet les cookies et redirige
// vers ce relais, que chaque bouton Google demande comme `next` — voir
// lib/auth/lien-google.ts pour le pourquoi.
//
// Ne compte qu'un jeton d'accès émis à l'instant, une seule fois par jeton
// (verrou Redis quand il existe) : rouvrir cette adresse ne gonfle rien.
// Ne refuse jamais rien : quoi qu'il arrive, la personne est redirigée.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, verifyToken } from '@/lib/server/auth';
import { redis } from '@/lib/server/redis';
import { enregistrerConnexion } from '@/lib/server/admin/connexions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { destinationSure, jetonFrais } from '@/lib/auth/lien-google';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const destination = destinationSure(req.nextUrl.searchParams.get('next'));

    try {
      const jeton = req.cookies.get(COOKIE_NAME)?.value;
      const payload = jeton ? await verifyToken(jeton) : null;
      const iat = (payload as { iat?: unknown } | null)?.iat;
      if (payload && jetonFrais(iat, Date.now())) {
        const premiereFois = redis
          ? (await redis.set(`cnx-google:${payload.sub}:${String(iat)}`, '1', {
              nx: true,
              ex: 600,
            })) !== null
          : true;
        if (premiereFois) {
          enregistrerConnexion({
            headers: req.headers,
            methode: 'GOOGLE',
            userId: payload.sub,
            requestId: ctx.requestId,
          });
        }
      }
    } catch (err) {
      // Une statistique ne bloque jamais l'arrivée sur le site.
      log.warn('connexion-google: comptage impossible', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.redirect(new URL(destination, req.url), 302);
  });
}
