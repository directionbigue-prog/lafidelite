// GET /api/admin/connexions — ce que la console sait des connexions.
//
// Trois réponses en une : la répartition par type d'appareil, la répartition
// par pays, et la série temporelle à l'échelle demandée. Les trois partagent
// la même fenêtre, sinon les totaux affichés côte à côte ne se compareraient
// pas — un visiteur lirait « 40 téléphones » sous un graphique qui en montre
// 12, et conclurait à un bug.
//
// Lecture seule, donc `requireAdmin('ADMIN')` et non SUPERADMIN : un ADMIN a
// déjà `users:read`, et ces chiffres sont agrégés — ils ne nomment personne.
// Aucun `logAdminAction` : cette route ne mute rien, et l'invariant de
// CLAUDE.md porte sur les mutations du back-office.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { prisma } from '@/lib/server/prisma';
import {
  estGranularite,
  debutDeFenetre,
  construireSerie,
  classer,
  libelleAppareil,
  nomPays,
  drapeau,
  POINTS_PAR_GRANULARITE,
  DERNIERES_CONNEXIONS,
  ligneConnexion,
  type Granularite,
} from '@/lib/admin/connexions';
import { libelleMethode } from '@/lib/server/admin/connexions';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    // Une granularité inconnue retombe sur « jour » au lieu de répondre 400 :
    // un paramètre d'affichage erroné ne doit pas remplacer un tableau de bord
    // par une erreur. La valeur est validée, donc rien d'arbitraire n'atteint
    // le calcul des seaux.
    const brut = req.nextUrl.searchParams.get('granularite');
    const granularite: Granularite = estGranularite(brut) ? brut : 'jour';

    const maintenant = new Date();
    const depuis = debutDeFenetre(granularite, maintenant);

    // Une seule lecture, découpée ensuite en mémoire. Trois `groupBy` feraient
    // trois allers-retours vers un Postgres distant (~320 ms chacun sur cette
    // base) pour des volumes que la fenêtre borne déjà.
    const lignes = await prisma.connexionEvent.findMany({
      where: { createdAt: { gte: depuis } },
      select: { appareil: true, pays: true, methode: true, createdAt: true, userId: true },
      // Garde-fou : une fenêtre d'un an pourrait devenir large. Au-delà, les
      // chiffres sont tronqués plutôt que de faire tomber la console, et le
      // drapeau `tronque` le dit à l'écran au lieu de le cacher.
      take: 50_000,
      orderBy: { createdAt: 'desc' },
    });

    // La liste détaillée : les dernières connexions, quelle que soit l'échelle
    // choisie (à l'échelle « heure », la fenêtre peut être vide alors qu'on
    // veut voir les dernières visites). Appareil, date, pays — et rien qui
    // identifie la personne : la liste reste anonyme comme les agrégats.
    const dernieres = await prisma.connexionEvent.findMany({
      select: { appareil: true, pays: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: DERNIERES_CONNEXIONS,
    });

    const compter = (cles: readonly (string | null)[]): { cle: string; nombre: number }[] => {
      const m = new Map<string, number>();
      for (const c of cles) {
        const k = c ?? '';
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m].map(([cle, nombre]) => ({ cle, nombre }));
    };

    const appareils = classer(compter(lignes.map((l) => l.appareil)), libelleAppareil);
    const pays = classer(compter(lignes.map((l) => l.pays)), nomPays).map((p) => ({
      ...p,
      drapeau: drapeau(p.cle),
    }));
    const methodes = classer(compter(lignes.map((l) => l.methode)), libelleMethode);

    const serie = construireSerie(
      lignes.map((l) => ({ debut: l.createdAt, nombre: 1 })),
      granularite,
      maintenant,
    );

    return NextResponse.json(
      {
        granularite,
        depuis: depuis.toISOString(),
        points: POINTS_PAR_GRANULARITE[granularite],
        total: lignes.length,
        // Des personnes distinctes, pas des connexions : deux chiffres très
        // différents qu'un seul « total » confondrait.
        comptesDistincts: new Set(lignes.map((l) => l.userId).filter(Boolean)).size,
        tronque: lignes.length >= 50_000,
        appareils,
        pays,
        methodes,
        serie,
        dernieres: (dernieres ?? []).map(ligneConnexion),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
