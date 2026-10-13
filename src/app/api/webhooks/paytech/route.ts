/**
 * POST /api/webhooks/paytech — PayTech IPN (Instant Payment Notification).
 *
 * Thin shim over the PROTECTED factory `lib/server/webhook/handler.ts`, like
 * the Bictorys route: the factory reads the raw body, verifies it through
 * `paytechWebhookProvider` (HMAC or SHA256-of-keys echo, in the body), dedups
 * on WebhookLog (token + type_event) and runs everything below inside one
 * Serializable transaction.
 *
 * Three checks before a pack opens, on top of the signature:
 *   - the order is OURS and was charged through PayTech (`ref_command` is our
 *     Order id, and its `token` must be the one stored at checkout);
 *   - the IPN's `env` matches PAYTECH_ENV — a sandbox payment must never open
 *     a real pack;
 *   - `item_price` matches the order amount (lib/server/payments/paytech.ts).
 * A refused IPN still answers 200 (the factory commits the WebhookLog): PayTech
 * would otherwise retry it forever. The super-admin dashboard flags any paid
 * pack order that opened nothing.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { createWebhookHandler, type PrismaTransactionClient } from '@/lib/server/webhook/handler';
import {
  montantIpnAcceptable,
  paytechEnv,
  paytechWebhookProvider,
  type PaytechIpn,
} from '@/lib/server/payments/paytech';
import {
  echouerCommande,
  encaisserCommande,
  rembourserCommande,
} from '@/lib/server/payments/encaissement';
import { prisma } from '@/lib/server/prisma';
import { createLogger } from '@/lib/server/logger';

const log = createLogger();

async function commandeDe(tx: PrismaTransactionClient, ipn: PaytechIpn) {
  const order = await tx.order.findUnique({ where: { id: ipn.ref_command } });
  if (!order || order.provider !== 'paytech') return null;
  if (order.providerChargeId && order.providerChargeId !== ipn.token) return null;
  return order;
}

export const POST = createWebhookHandler<PaytechIpn>({
  prisma,
  // Keys are read at call time: a missing key makes every IPN fail its
  // signature (401) instead of crashing the module on import.
  provider: paytechWebhookProvider(() => ({
    apiKey: process.env.PAYTECH_API_KEY?.trim() ?? '',
    apiSecret: process.env.PAYTECH_API_SECRET?.trim() ?? '',
  })),

  async onPaid(ipn, tx) {
    const order = await commandeDe(tx, ipn);
    if (!order) {
      log.warn('[paytech] IPN for an unknown order', { ref: ipn.ref_command });
      return {};
    }
    if (ipn.env && ipn.env !== paytechEnv()) {
      log.warn('[paytech] IPN env mismatch — nothing opened', {
        orderId: order.id,
        env: ipn.env,
      });
      return {};
    }
    if (!montantIpnAcceptable(ipn.item_price, order.amount)) {
      log.error('[paytech] IPN amount mismatch — nothing opened', {
        orderId: order.id,
        expected: order.amount,
        got: ipn.item_price,
      });
      return {};
    }
    await encaisserCommande(tx, order, ipn.payment_method ?? null);
    return {};
  },

  async onRefunded(ipn, tx) {
    const order = await commandeDe(tx, ipn);
    if (order) await rembourserCommande(tx, order.id);
    return {};
  },

  async onFailed(ipn, tx) {
    const order = await commandeDe(tx, ipn);
    if (order) await echouerCommande(tx, order.id);
    return {};
  },
});
