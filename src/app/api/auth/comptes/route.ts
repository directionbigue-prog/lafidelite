// /api/auth/comptes — plusieurs comptes sur un même appareil.
//
//   GET                          → le compte actif et les autres comptes de l'appareil
//   POST { action: 'basculer', userId } → le compte choisi devient actif
//   POST { action: 'ajouter' }   → le compte actif passe au coffre, la session
//                                  se libère pour qu'on se connecte à un autre
//   POST { action: 'retirer', userId }  → oublie un compte de cet appareil
//
// Le fonctionnement et la raison pour laquelle c'est sûr sont décrits dans
// lib/auth/comptes-appareil.ts. Ce fichier ne touche à lib/server/auth.ts
// (protégé) qu'à travers ses fonctions exportées : chaque jeton du coffre est
// revérifié comme le fait /api/auth/refresh — signature, compte existant,
// `tokenVersion`, statut SUSPENDED.
//
// Sous /api/auth parce que le cookie de rafraîchissement, comme le coffre,
// n'est envoyé qu'à ce chemin.
//
// CSRF : vérifié quand une session existe. Depuis l'écran de connexion il n'y
// a plus de cookie CSRF (la déconnexion l'efface) ; une origine étrangère est
// alors refusée à la place, comme pour le lien d'invitation.
export const runtime = 'nodejs';

import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  CSRF_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  clearAuthCookies,
  clearCsrfCookie,
  createAccessToken,
  createRefreshToken,
  setAuthCookies,
  setCsrfCookie,
  verifyCsrf,
  verifyRefreshToken,
} from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { origineEtrangere } from '@/lib/server/origine';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import {
  COMPTES_MAX,
  ecrireCoffre,
  libelleCompte,
  lireCoffre,
  ranger,
  retirer,
  type EntreeCoffre,
} from '@/lib/auth/comptes-appareil';
import { estAdresseInvite } from '@/lib/couples/compte-invite';

const COFFRE_COOKIE_NAME = REFRESH_COOKIE_NAME.replace(/-refresh$/, '-comptes');
const COFFRE_MAX_AGE = 7 * 24 * 60 * 60; // la durée d'un jeton de rafraîchissement

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('basculer'), userId: z.string().min(1).max(64) }),
  z.object({ action: z.literal('ajouter') }),
  z.object({ action: z.literal('retirer'), userId: z.string().min(1).max(64) }),
]);

interface CompteVerifie extends EntreeCoffre {
  name: string | null;
  email: string;
  tokenVersion: number;
}

/** Revérifie des jetons de rafraîchissement ; ne garde que les comptes encore valides. */
async function verifier(jetons: readonly string[]): Promise<CompteVerifie[]> {
  const decodes: { jeton: string; sub: string; tokenVersion: number }[] = [];
  for (const jeton of jetons) {
    const p = await verifyRefreshToken(jeton);
    if (p) decodes.push({ jeton, ...p });
  }
  if (decodes.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: decodes.map((d) => d.sub) } },
    select: { id: true, name: true, email: true, tokenVersion: true, status: true },
  });
  const parId = new Map(users.map((u) => [u.id, u]));

  const out: CompteVerifie[] = [];
  for (const d of decodes) {
    const u = parId.get(d.sub);
    if (!u || u.status === 'SUSPENDED' || u.tokenVersion !== d.tokenVersion) continue;
    if (out.some((c) => c.userId === u.id)) continue;
    out.push({
      userId: u.id,
      jeton: d.jeton,
      name: u.name,
      email: u.email,
      tokenVersion: u.tokenVersion,
    });
  }
  return out;
}

async function ecrireCookieCoffre(entrees: readonly EntreeCoffre[]): Promise<void> {
  const store = await cookies();
  const domain =
    process.env.NODE_ENV === 'production' ? process.env.COOKIE_DOMAIN || undefined : undefined;
  store.set(COFFRE_COOKIE_NAME, entrees.length ? ecrireCoffre(entrees) : '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: entrees.length ? COFFRE_MAX_AGE : 0,
    path: '/api/auth',
    ...(domain ? { domain } : {}),
  });
}

function presenter(c: CompteVerifie) {
  return { id: c.userId, ...libelleCompte(c.name, c.email, estAdresseInvite(c.email)) };
}

/** Le compte actif (cookie de rafraîchissement) et le coffre, tous revérifiés. */
async function etatDeLAppareil(req: NextRequest) {
  const jetonActif = req.cookies.get(REFRESH_COOKIE_NAME)?.value;
  const [actif] = jetonActif ? await verifier([jetonActif]) : [];
  const coffre = (await verifier(lireCoffre(req.cookies.get(COFFRE_COOKIE_NAME)?.value))).filter(
    (c) => c.userId !== actif?.userId,
  );
  return { actif: actif ?? null, coffre };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const { actif, coffre } = await etatDeLAppareil(req);
    // Les jetons expirés ou révoqués sortent du coffre au passage.
    const brut = lireCoffre(req.cookies.get(COFFRE_COOKIE_NAME)?.value);
    if (brut.length !== coffre.length) await ecrireCookieCoffre(coffre);

    return NextResponse.json(
      {
        actuel: actif ? presenter(actif) : null,
        autres: coffre.map(presenter),
        max: COMPTES_MAX,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };

    if (req.cookies.get(CSRF_COOKIE_NAME)?.value) {
      const csrfFail = verifyCsrf(req);
      if (csrfFail) return csrfFail;
    } else if (origineEtrangere(req)) {
      return NextResponse.json(
        { error: 'CSRF_ORIGIN_MISMATCH', message: 'Cross-site request refused.' },
        { status: 403, headers },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers },
      );
    }
    const corps = parsed.data;
    const { actif, coffre } = await etatDeLAppareil(req);

    if (corps.action === 'retirer') {
      await ecrireCookieCoffre(retirer(coffre, corps.userId));
      return NextResponse.json({ ok: true }, { headers });
    }

    if (corps.action === 'ajouter') {
      if (!actif) {
        return NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'No active session.' },
          { status: 401, headers },
        );
      }
      await ecrireCookieCoffre(ranger(coffre, actif));
      await clearAuthCookies();
      await clearCsrfCookie();
      return NextResponse.json({ ok: true }, { headers });
    }

    // basculer
    const cible = coffre.find((c) => c.userId === corps.userId);
    if (!cible) {
      return NextResponse.json(
        {
          error: 'COMPTE_INCONNU',
          message: 'This account is not available on this device anymore.',
        },
        { status: 404, headers },
      );
    }

    const access = await createAccessToken({
      sub: cible.userId,
      email: cible.email,
      tokenVersion: cible.tokenVersion,
    });
    const refresh = await createRefreshToken(cible.userId, cible.tokenVersion);
    await setAuthCookies(access, refresh);
    await setCsrfCookie();
    await ecrireCookieCoffre(ranger(coffre, actif, cible.userId));

    log.info('account switch', { userId: cible.userId });
    return NextResponse.json({ ok: true, user: { sub: cible.userId } }, { headers });
  });
}
