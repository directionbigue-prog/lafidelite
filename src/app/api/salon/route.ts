// POST /api/salon — commencer ou reprendre une partie.
//
// Idempotent par construction : s'il existe déjà une partie IN_PROGRESS de
// ce jeu pour le couple (ou pour le compte seul, s'il n'a pas de couple
// actif), on la renvoie. C'est aussi ce qui fait de cette
// route le bouton « Reprendre » — le client n'a pas à distinguer les deux
// cas, et l'index unique partiel BoardGame_couple_kind_in_progress_unique
// garantit qu'il n'y en a jamais deux.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import {
  packDuProprietaire,
  partiesDe,
  proprietaireAEcrire,
  proprietaireDuSalon,
} from '@/lib/server/salon/proprietaire';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
// La liste des jeux, la garde qui rétrécit le type et l'état initial vivent
// dans `lib/salon/jeux.ts` : ils doivent s'étendre ensemble, et cette route
// n'était pas seule à les lire (voir current/route.ts).
import { estUnJeu, etatInitial, parseEtat } from '@/lib/salon/jeux';
import { MESSAGE_SALON_VERROUILLE } from '@/lib/salon/verrou';

// Deux appels concurrents (les deux membres du couple ouvrent le Salon au
// même instant) peuvent tous les deux passer la lecture `findFirst`
// ci-dessous avant qu'aucun `create` n'ait eu lieu — la même course que
// `Couple_creator_active_unique` sur POST /api/couples (voir
// couples/route.ts). Le perdant se fait rejeter par l'index unique partiel
// `BoardGame_couple_kind_in_progress_unique` avec un P2002 ; le rattraper
// et renvoyer la partie gagnante est ce qui tient la promesse d'idempotence
// de cette route même sous concurrence.
function isUniqueConstraintError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

function isInProgressRaceConflict(err: Prisma.PrismaClientKnownRequestError): boolean {
  const target = err.meta?.target;
  const targets = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
  // Deux index partiels, un par propriétaire : celui du couple et, depuis
  // que le Salon s'ouvre aux comptes seuls, celui du compte — un même compte
  // peut ouvrir le même jeu sur deux onglets dans la même seconde.
  return targets.some(
    (t) =>
      t.includes('coupleId') ||
      t.includes('userId') ||
      t.includes('BoardGame_couple_kind_in_progress_unique') ||
      t.includes('BoardGame_user_kind_in_progress_unique'),
  );
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

    const body: unknown = await req.json().catch(() => null);
    const kind = (body as { kind?: unknown } | null)?.kind;
    if (!estUnJeu(kind)) {
      return NextResponse.json(
        { error: 'INVALID_KIND', message: 'Ce jeu n’existe pas.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Le couple actif, ou l'appelant seul : depuis le 13/10/2026 un compte
    // sans partenaire joue au Salon avec qui est assis à côté de lui (voir
    // lib/server/salon/proprietaire.ts). Plus de `COUPLE_REQUIRED` ici.
    const proprietaire = await proprietaireDuSalon(prisma, auth.user.sub);

    // Le Salon est offert avec tout pack payant, et avec eux seuls. C'est
    // la seule porte : le palier Découverte sert à essayer le jeu du
    // couple, pas à jouer aux dames indéfiniment sans payer.
    //
    // Posée sur la CRÉATION, pas sur la lecture — `GET /api/salon/current`,
    // `PUT /state` et `/end` restent ouverts, pour qu'un pack qui expire au
    // milieu d'une partie de ludo ne laisse pas un plateau inachevé et
    // irrécupérable sur l'écran des joueurs.
    const pack = await packDuProprietaire(prisma, proprietaire);
    if (!pack.salon) {
      return NextResponse.json(
        {
          error: 'SALON_LOCKED',
          message: MESSAGE_SALON_VERROUILLE,
          pack: pack.id,
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const selection = {
      id: true,
      kind: true,
      status: true,
      state: true,
      moveCount: true,
    } satisfies Prisma.BoardGameSelect;
    type PartieSelectionnee = Prisma.BoardGameGetPayload<{ select: typeof selection }>;

    /**
     * Une partie LUE en base ne sort qu'après être passée par le schéma de
     * son jeu — `null` plutôt qu'un plateau corrompu, ce qui dit au client
     * de repartir de la position de départ. Même règle que
     * `GET /api/salon/current` : les deux routes qui rendent une partie
     * accordent la même confiance à la base, c'est-à-dire aucune.
     *
     * Ne s'applique qu'aux deux branches qui LISENT (`existante`,
     * `gagnante`). La branche `creee` sort telle quelle : on vient d'y
     * écrire `etatInitial(kind)`, la relire par son propre schéma ne
     * vérifierait que nous-mêmes. L'asymétrie est délibérée — le doute
     * porte sur ce que la base contenait, pas sur ce qu'on vient d'y
     * mettre.
     *
     * Écrit à chaque site plutôt que dans une fonction imbriquée : le
     * rétrécissement de `kind` par `estUnJeu` ne traverse pas une
     * déclaration de fonction, et le retrouver demanderait une annotation
     * qui vaut moins qu'une ligne recopiée deux fois.
     */
    const existante: PartieSelectionnee | null = await prisma.boardGame.findFirst({
      where: { ...partiesDe(proprietaire), kind, status: 'IN_PROGRESS' },
      select: selection,
    });
    if (existante !== null) {
      return NextResponse.json(
        { ...existante, state: parseEtat(kind, existante.state) },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    let creee: PartieSelectionnee;
    try {
      creee = await prisma.boardGame.create({
        data: {
          ...proprietaireAEcrire(proprietaire),
          kind,
          state: etatInitial(kind) as Prisma.InputJsonValue,
        },
        select: selection,
      });
    } catch (err) {
      if (isUniqueConstraintError(err) && isInProgressRaceConflict(err)) {
        // Perdu la course : l'autre membre du couple vient de créer la
        // partie en cours entre notre lecture et notre écriture. On
        // rattrape et on renvoie la partie gagnante — le même résultat que
        // si `existante` l'avait trouvée du premier coup.
        const gagnante = await prisma.boardGame.findFirst({
          where: { ...partiesDe(proprietaire), kind, status: 'IN_PROGRESS' },
          select: selection,
        });
        if (gagnante !== null) {
          return NextResponse.json(
            { ...gagnante, state: parseEtat(kind, gagnante.state) },
            { status: 200, headers: { 'x-request-id': ctx.requestId } },
          );
        }
      }
      throw err;
    }

    // Pas de `parseEtat` ici, et c'est voulu : `creee.state` est le
    // `etatInitial(kind)` qu'on vient d'écrire quelques lignes plus haut.
    return NextResponse.json(creee, { status: 201, headers: { 'x-request-id': ctx.requestId } });
  });
}
