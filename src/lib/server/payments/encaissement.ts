// What a confirmed payment does, whichever provider confirmed it.
//
// Shared by the Bictorys and PayTech webhook routes, and always called INSIDE
// the Serializable transaction opened by the protected `createWebhookHandler`:
// the status change, the Entitlement and the outbox events commit together or
// not at all (CLAUDE.md: side-effects go through the outbox, never closures).
//
// Extracted on 2026-10-13 when PayTech arrived: two copies of "mark PAID +
// open the pack" would be two rules that drift — and the one that drifts is
// the one a paying customer meets.
import 'server-only';
import type { Order } from '@prisma/client';
import { enqueueOutbox } from '@/lib/server/outbox';
import type { PrismaTransactionClient } from '@/lib/server/webhook/handler';
import { droitDeLaCommande } from '@/lib/game/achat';

type CommandeLue = Pick<
  Order,
  'id' | 'userId' | 'amount' | 'currency' | 'customerEmail' | 'metadata'
> & { status?: string | null };

/**
 * Marks the order PAID, opens the pack it bought (once — `orderId` is unique,
 * and a P2002 would abort the whole Serializable tx, so it is looked up
 * first), and queues the confirmation events.
 */
export async function encaisserCommande(
  tx: PrismaTransactionClient,
  order: CommandeLue,
  paymentMethod: string | null,
): Promise<void> {
  // A replayed confirmation for an order already settled changes nothing.
  if (order.status === 'PAID') return;

  const paidAt = new Date();
  await tx.order.update({
    where: { id: order.id },
    data: {
      status: 'PAID',
      paidAt,
      ...(paymentMethod !== null ? { paymentMethod } : {}),
    },
  });

  // Cœur Fidèle : une commande de pack payée au prix du registre ouvre le
  // droit (lib/game/achat.ts).
  const droit = order.userId ? droitDeLaCommande(order, paidAt) : null;
  if (droit && order.userId) {
    const deja = await tx.entitlement.findUnique({ where: { orderId: order.id } });
    if (!deja) {
      await tx.entitlement.create({
        data: {
          userId: order.userId,
          packId: droit.packId,
          expiresAt: droit.expiresAt,
          orderId: order.id,
        },
      });
    }
  }

  if (order.userId) {
    await enqueueOutbox(tx, {
      kind: 'notification.payment_received',
      payload: {
        userId: order.userId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
      },
    });
  }
  if (order.customerEmail) {
    await enqueueOutbox(tx, {
      kind: 'email.payment_confirmation',
      payload: {
        to: order.customerEmail,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
      },
    });
  }
}

/** Refunded: the order and the pack it had opened both close. */
export async function rembourserCommande(
  tx: PrismaTransactionClient,
  orderId: string,
): Promise<void> {
  await tx.order.update({ where: { id: orderId }, data: { status: 'REFUNDED' } });
  await tx.entitlement.updateMany({
    where: { orderId, status: 'ACTIVE' },
    data: { status: 'REFUNDED' },
  });
}

/** Failed or cancelled — never downgrades an order already PAID. */
export async function echouerCommande(tx: PrismaTransactionClient, orderId: string): Promise<void> {
  await tx.order.updateMany({
    where: { id: orderId, status: { not: 'PAID' } },
    data: { status: 'FAILED' },
  });
}
