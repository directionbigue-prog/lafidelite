// /api/cron/rappels-couple — les deux mails du soir du rituel.
//
// Une fois par jour, à 18 h UTC (= Dakar). Pour chaque couple ACTIF, au plus
// UN des deux mails, par ordre d'urgence :
//
//   1. « Flamme en danger » — la série (≥ 2 jours) s'éteint à minuit si le
//      couple ne joue pas ce soir. Une alerte par partenaire et par jour.
//   2. « Une question vous attend » — le couple est absent depuis 2 à 14 jours
//      (`lib/rituel/rappel.ts`). Un seul rappel par absence : la clé porte le
//      dernier jour actif.
//
// Jamais les deux le même soir : un couple en danger de perdre sa série
// n'est pas absent, et deux mails d'un coup se liraient comme du harcèlement.
//
// Chaque envoi passe par `envoyerMailRituel` — préférence, PUIS notification
// (la déduplication), PUIS mail. Un cron rejoué le même jour ne renvoie rien.
//
// Le cron vide lui-même ce qu'il vient de mettre en file, dans son budget :
// chez Vercel, `email-queue-drain` ne passe qu'une fois par jour, à 4 h, et un
// mail du soir arrivant au petit matin aurait raté son moment.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { origineSansRequete } from '@/lib/server/app-url';
import { chargerActivite } from '@/lib/server/rituel/activite';
import { envoyerMailRituel } from '@/lib/server/rituel/notifier';
import { joursActifs } from '@/lib/rituel/badges';
import { calculerSerie } from '@/lib/rituel/serie';
import { decaler, jourDe } from '@/lib/rituel/jour';
import {
  ABSENCE_MAX_JOURS,
  cleFlamme,
  cleRappel,
  doitRelancer,
  flammeAAlerter,
  mailFlamme,
  mailRappel,
  TYPE_FLAMME,
  TYPE_RAPPEL,
} from '@/lib/rituel/rappel';

const log = createLogger();
const LEASE_TTL_MS = 120_000;
/** Laisse de la marge sous `maxDuration` pour répondre. */
const BUDGET_MS = 45_000;
const LOT = 200;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const debut = Date.now();
    let examines = 0;
    let flammes = 0;
    let relances = 0;
    let envoyes = 0;

    await withLease(redis ?? undefined, 'rappels-couple', LEASE_TTL_MS, async () => {
      const queue = getEmailQueue();
      if (!queue) {
        log.warn('rappels-couple: email queue not configured, nothing sent', {
          requestId: ctx.requestId,
        });
        return;
      }

      const aujourdhui = jourDe(new Date());
      const plusAncien = decaler(aujourdhui, -ABSENCE_MAX_JOURS);
      const origine = origineSansRequete();

      // Filtré sur le statut seulement : la dernière activité se lit dans
      // les parties et les réponses du jour, pas dans une colonne du couple.
      const couples = await prisma.couple.findMany({
        where: { status: 'ACTIVE', partnerId: { not: null } },
        select: {
          id: true,
          pairedAt: true,
          creator: { select: { id: true, email: true, name: true, status: true } },
          partner: { select: { id: true, email: true, name: true, status: true } },
        },
        take: LOT,
        orderBy: { pairedAt: 'desc' },
      });

      for (const couple of couples) {
        if (Date.now() - debut > BUDGET_MS) break;
        if (!couple.partner) continue;
        examines++;

        const activite = await chargerActivite(prisma, couple);
        const jours = joursActifs(activite).sort();
        const serie = calculerSerie(jours, aujourdhui);
        const dernier = jours[jours.length - 1] ?? activite.forme;

        const paires = [
          { moi: couple.creator, autre: couple.partner },
          { moi: couple.partner, autre: couple.creator },
        ];

        if (flammeAAlerter(serie)) {
          for (const { moi, autre } of paires) {
            const ok = await envoyerMailRituel(prisma, queue, {
              destinataire: moi,
              type: TYPE_FLAMME,
              titre: `Votre flamme de ${serie.actuelle} jours vacille`,
              dedupeKey: cleFlamme(moi.id, aujourdhui),
              mail: mailFlamme({
                prenom: moi.name,
                partenaire: autre.name,
                jours: serie.actuelle,
                origine,
              }),
            });
            if (ok) flammes++;
          }
          continue;
        }

        if (!dernier || dernier < plusAncien || !doitRelancer(dernier, aujourdhui)) continue;
        for (const { moi, autre } of paires) {
          const ok = await envoyerMailRituel(prisma, queue, {
            destinataire: moi,
            type: TYPE_RAPPEL,
            titre: 'Une question vous attend',
            dedupeKey: cleRappel(moi.id, dernier),
            data: { dernierJourActif: dernier },
            mail: mailRappel({
              prenom: moi.name,
              partenaire: autre.name,
              serieRecord: serie.record,
              origine,
            }),
          });
          if (ok) relances++;
        }
      }

      // Vider ce qu'on vient de mettre en file, dans le temps qui reste.
      while (Date.now() - debut < BUDGET_MS) {
        const issue = await queue.drainOne();
        if (issue === 'empty') break;
        if (issue === 'sent') envoyes++;
      }

      log.info('rappels-couple tick', {
        examines,
        flammes,
        relances,
        envoyes,
        requestId: ctx.requestId,
      });
    });

    return NextResponse.json(
      { ok: true, examines, flammes, relances, envoyes },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

// Vercel Cron n'envoie que des GET : sans cet alias, la tâche répondrait 405
// tous les jours sans que rien ne le signale. Voir cron-get-alias.test.ts.
export const GET = POST;
