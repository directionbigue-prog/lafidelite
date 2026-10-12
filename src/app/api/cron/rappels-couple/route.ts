// /api/cron/rappels-couple — un mail doux aux couples qui ne viennent plus.
//
// Une fois par jour. Pour chaque couple ACTIF absent depuis 2 à 14 jours
// (`lib/rituel/rappel.ts`), chaque partenaire qui n'a pas coupé les rappels
// reçoit UN mail par absence : la clé de déduplication porte le dernier jour
// actif, et `createNotification` refuse la seconde (P2002 → null).
//
// LA NOTIFICATION D'ABORD, LE MAIL ENSUITE — et seulement si elle vient
// d'être créée, comme le demande `notifications/templates.ts`. Un cron rejoué
// le même jour ne renvoie donc rien.
//
// Pas de mail du tout tant que la file d'emails n'est pas configurée : sans
// elle, créer la notification « consommerait » le rappel sans l'envoyer.
//
// Le cron vide lui-même ce qu'il vient de mettre en file, dans son budget :
// chez Vercel, `email-queue-drain` ne passe qu'une fois par jour, à 4 h, et un
// rappel du soir arrivant au petit matin aurait raté son moment.
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
import { createNotification } from '@/lib/server/notifications';
import { rappelCouple } from '@/lib/server/notifications/templates';
import { isChannelEnabled, type NotificationPrefs } from '@/lib/server/notifications/prefs-merge';
import { origineSansRequete } from '@/lib/server/app-url';
import { chargerActivite } from '@/lib/server/rituel/activite';
import { joursActifs } from '@/lib/rituel/badges';
import { calculerSerie } from '@/lib/rituel/serie';
import { decaler, jourDe } from '@/lib/rituel/jour';
import { ABSENCE_MAX_JOURS, doitRelancer, mailRappel, TYPE_RAPPEL } from '@/lib/rituel/rappel';

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

      const origine = origineSansRequete();
      const plusAncien = decaler(aujourdhui, -ABSENCE_MAX_JOURS);

      for (const couple of couples) {
        if (Date.now() - debut > BUDGET_MS) break;
        examines++;

        const activite = await chargerActivite(prisma, couple);
        const jours = joursActifs(activite).sort();
        const dernier = jours[jours.length - 1] ?? activite.forme;
        if (!dernier || dernier < plusAncien || !doitRelancer(dernier, aujourdhui)) continue;

        const record = calculerSerie(jours, aujourdhui).record;
        const membres = [
          { moi: couple.creator, autre: couple.partner },
          { moi: couple.partner, autre: couple.creator },
        ];

        for (const { moi, autre } of membres) {
          if (!moi || moi.status !== 'ACTIVE') continue;

          const pref = await prisma.notificationPreferences.findUnique({
            where: { userId: moi.id },
            select: { prefs: true },
          });
          const prefs = (pref?.prefs ?? null) as NotificationPrefs | null;
          if (!isChannelEnabled(prefs, TYPE_RAPPEL, 'email')) continue;

          const cree = await createNotification(prisma, rappelCouple(moi.id, dernier));
          if (!cree) continue; // déjà relancé pour cette absence
          relances++;

          const mail = mailRappel({
            prenom: moi.name,
            partenaire: autre?.name ?? null,
            serieRecord: record,
            origine,
          });
          await queue.enqueue({
            to: moi.email,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
          });
        }
      }

      // Vider ce qu'on vient de mettre en file, dans le temps qui reste.
      while (Date.now() - debut < BUDGET_MS) {
        const issue = await queue.drainOne();
        if (issue === 'empty') break;
        if (issue === 'sent') envoyes++;
      }

      log.info('rappels-couple tick', { examines, relances, envoyes, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, examines, relances, envoyes },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

// Vercel Cron n'envoie que des GET : sans cet alias, la tâche répondrait 405
// tous les jours sans que rien ne le signale. Voir cron-get-alias.test.ts.
export const GET = POST;
