// PUT /api/salon/[id]/state — sauvegarder le plateau.
//
// Le moteur tourne dans le navigateur ; cette route ne fait que conserver
// l'état pour que la partie survive à un onglet fermé. Elle valide la
// FORME de ce qu'on lui donne mais jamais la légalité du coup — voir la
// spec, §« le moteur tourne dans le navigateur ».
//
// ── Le schéma dépend du JEU, et cette route a mis du temps à le savoir ──
//
// Elle a longtemps validé **tout** état avec `parseEtatPlateau`, le schéma
// des dames — écrit à l'époque où les dames étaient le seul jeu. Les deux
// routes de lecture, elles, passaient déjà par `parseEtat(kind, …)`.
//
// Conséquence, restée invisible à 1 740 tests : dès qu'un second jeu est
// arrivé, **aucune de ses sauvegardes ne pouvait réussir**. Un plateau
// d'Awalé n'a pas la forme d'un damier, donc 400 à chaque coup — et comme
// le client sauvegarde en tâche de fond sans attendre la réponse, personne
// ne voyait l'erreur. On jouait, et tout était perdu au rechargement.
//
// D'où l'ordre des gardes ci-dessous, qui n'est pas arbitraire : le `kind`
// vit en base, donc la forme de l'état ne peut être jugée qu'APRÈS avoir
// retrouvé la partie. Ce qui ne dépend pas du jeu — le compteur de coups —
// reste vérifié avant tout accès à la base.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { partiesDe, proprietaireDuSalon } from '@/lib/server/salon/proprietaire';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { estUnJeu, parseEtat } from '@/lib/salon/jeux';

/**
 * Le plafond du compteur de coups.
 *
 * `BoardGame."moveCount"` est un `INTEGER` Postgres — 2 147 483 647 au
 * maximum. Sans borne haute, un client pouvait envoyer 2 147 483 648 et
 * récupérer un 500 (Postgres refuse la valeur, rien ne rattrape) au lieu
 * d'un 400 ; pire, il pouvait envoyer 2 147 483 647, que la base accepte —
 * et geler définitivement la sauvegarde de sa propre partie, puisque plus
 * aucun compteur ne pourrait lui être strictement supérieur.
 *
 * 100 000 est très au-delà de toute partie réelle : la plus longue partie
 * de dames jamais enregistrée tient en quelques centaines de coups.
 */
const MOVE_COUNT_MAX = 100_000;

export async function PUT(
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
    const brut = body as { state?: unknown; moveCount?: unknown } | null;

    // Ce qui ne dépend pas du jeu se vérifie avant tout accès à la base :
    // un compteur hors bornes n'a aucune raison de coûter une requête.
    const moveCount = brut?.moveCount;
    if (
      typeof moveCount !== 'number' ||
      !Number.isInteger(moveCount) ||
      moveCount < 0 ||
      moveCount > MOVE_COUNT_MAX
    ) {
      return NextResponse.json(
        { error: 'INVALID_STATE', message: 'Plateau illisible.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Le couple actif, ou l'appelant seul — même résolution que POST.
    const proprietaire = await proprietaireDuSalon(prisma, auth.user.sub);
    const siennes = partiesDe(proprietaire);

    // 404 et non 403 : une partie qui n'est pas celle de ce couple (ou de
    // ce compte seul) ne doit pas révéler son existence. Motif déjà établi
    // par requireOrgRole.
    const partie = await prisma.boardGame.findFirst({
      where: { id, ...siennes, status: 'IN_PROGRESS' },
      select: { id: true, kind: true },
    });
    if (partie === null) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Partie introuvable.' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Le jeu est connu : son schéma peut enfin juger la forme de l'état.
    // `estUnJeu` rétrécit le `string` de la base vers l'union `Jeu`, ce qui
    // fait pointer `parseEtat` sur le bon schéma. Un `kind` que ce build ne
    // connaît pas — une partie créée par une version plus récente — se
    // refuse plutôt que de se voir appliquer le schéma d'un autre jeu.
    const etat = estUnJeu(partie.kind) ? parseEtat(partie.kind, brut?.state) : null;
    if (etat === null) {
      return NextResponse.json(
        { error: 'INVALID_STATE', message: 'Plateau illisible.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // LA garde de cette route. Le client sauvegarde en tâche de fond sans
    // attendre la réponse, donc deux requêtes peuvent arriver dans le
    // désordre. En exigeant un moveCount strictement croissant, une
    // sauvegarde en retard ne peut plus recouvrir un plateau plus récent.
    //
    // `updateMany` avec la condition dans le `where` fait de la lecture et
    // de l'écriture une seule opération atomique : un `findFirst` suivi
    // d'un `update` laisserait une fenêtre entre les deux.
    //
    // Le propriétaire (`siennes` : le `coupleId`, ou le `userId` d'un compte
    // seul) y figure aussi, alors que le `findFirst` ci-dessus l'a
    // déjà exigé et que `id` est la clé primaire : ce n'est pas une faille
    // qu'on referme, c'est une écriture qui se défend seule. Le jour où ce
    // motif sera recopié pour le ludo, il partira juste.
    const ecrit = await prisma.boardGame.updateMany({
      where: { id, ...siennes, status: 'IN_PROGRESS', moveCount: { lt: moveCount } },
      data: { state: etat as unknown as Prisma.InputJsonValue, moveCount },
    });

    if (ecrit.count === 0) {
      return NextResponse.json(
        { error: 'STALE_STATE', message: 'Une sauvegarde plus récente existe déjà.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { ok: true, moveCount },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
