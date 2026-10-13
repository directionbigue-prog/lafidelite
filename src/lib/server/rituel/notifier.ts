// L'unique chemin d'un mail du rituel : préférence, notification, puis mail.
//
// L'ORDRE EST LA GARANTIE. `createNotification` porte la clé de
// déduplication ; il rend `null` si la clé existe déjà, et c'est seulement
// quand il vient de CRÉER la ligne que le mail part (règle de
// `notifications/templates.ts`). Un cron rejoué, deux requêtes simultanées :
// au plus un mail.
//
// Pas de file d'emails configurée → on ne crée même pas la notification :
// sinon la clé serait « consommée » et le mail ne partirait jamais, même une
// fois la file branchée.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { createNotification } from '@/lib/server/notifications';
import { isChannelEnabled, type NotificationPrefs } from '@/lib/server/notifications/prefs-merge';
import type { EmailQueue } from '@/lib/server/queues/email-queue';
import { TYPE_RAPPEL, type MailRappel } from '@/lib/rituel/rappel';

export interface EnvoiRituel {
  destinataire: { id: string; email: string; status: string };
  type: string;
  titre: string;
  dedupeKey: string;
  mail: MailRappel;
  data?: Record<string, unknown>;
}

/** `true` si un mail vient d'être mis en file. */
export async function envoyerMailRituel(
  prisma: PrismaClient,
  queue: EmailQueue | null,
  e: EnvoiRituel,
): Promise<boolean> {
  if (!queue || e.destinataire.status !== 'ACTIVE') return false;

  const pref = await prisma.notificationPreferences.findUnique({
    where: { userId: e.destinataire.id },
    select: { prefs: true },
  });
  // Un seul interrupteur pour tous les mails du rituel — voir `rappel.ts`.
  if (!isChannelEnabled((pref?.prefs ?? null) as NotificationPrefs | null, TYPE_RAPPEL, 'email')) {
    return false;
  }

  const cree = await createNotification(prisma, {
    userId: e.destinataire.id,
    type: e.type,
    title: e.titre,
    body: e.mail.text.split('\n\n')[1] ?? e.titre,
    dedupeKey: e.dedupeKey,
    ...(e.data ? { data: e.data } : {}),
  });
  if (!cree) return false;

  await queue.enqueue({
    to: e.destinataire.email,
    subject: e.mail.subject,
    html: e.mail.html,
    text: e.mail.text,
  });
  return true;
}
