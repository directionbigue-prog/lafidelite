// PayTech (paytech.sn) — the payment provider Cœur Fidèle sells packs through
// since 2026-10-13. Wave, Orange Money, Free Money and card on PayTech's
// hosted page.
//
// Two halves, both behind the repo's generic interfaces so nothing protected
// changes:
//   - `createPaytechProvider` implements `PaymentProvider.charge` for
//     POST /api/orders (hosted-redirect checkout).
//   - `paytechWebhookProvider` implements `WebhookProvider` for the protected
//     `createWebhookHandler` factory, which keeps its Serializable tx + dedup.
//
// PayTech quirks this file absorbs (see .claude/skills/izisaas-payments-handler):
//   - Auth is two custom headers, `API_KEY` and `API_SECRET` — not Bearer.
//   - ONE URL for test and prod; the mode is the `env` field of each request.
//   - The IPN is form-encoded by default (JSON on some accounts), and
//     `item_price` then arrives as a string.
//   - The IPN carries its proof IN THE BODY: `hmac_compute` when HMAC mode is
//     on in the dashboard, otherwise `sha256(apiKey)` / `sha256(apiSecret)`
//     echoes. Both are accepted, HMAC first, compared in constant time.
//   - Those hash fields are stripped before the payload reaches WebhookLog.
import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { ChargeInput, ChargeResult, PaymentProvider } from './provider';
import type { ParsedIds, WebhookEventType, WebhookProvider } from '../webhook/handler';

const API = 'https://paytech.sn/api';

export type PaytechEnv = 'test' | 'prod';

export interface PaytechConfig {
  apiKey: string;
  apiSecret: string;
  env: PaytechEnv;
  ipnUrl: string;
}

export function paytechConfigure(): boolean {
  return Boolean(process.env.PAYTECH_API_KEY?.trim() && process.env.PAYTECH_API_SECRET?.trim());
}

/** `PAYTECH_ENV` = `test` or `prod`; anything else (or nothing) means `prod`. */
export function paytechEnv(): PaytechEnv {
  return process.env.PAYTECH_ENV?.trim().toLowerCase() === 'test' ? 'test' : 'prod';
}

export function paytechConfigDepuisEnv(publicUrl: string): PaytechConfig {
  return {
    apiKey: process.env.PAYTECH_API_KEY?.trim() ?? '',
    apiSecret: process.env.PAYTECH_API_SECRET?.trim() ?? '',
    env: paytechEnv(),
    ipnUrl: `${publicUrl.replace(/\/+$/, '')}/api/webhooks/paytech`,
  };
}

export class PaytechError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'PaytechError';
  }
}

export function createPaytechProvider(cfg: PaytechConfig): PaymentProvider {
  return {
    name: 'paytech',
    async charge(input: ChargeInput): Promise<ChargeResult> {
      const libelle =
        typeof input.metadata?.itemName === 'string' ? input.metadata.itemName : 'Cœur Fidèle';
      const r = await fetch(`${API}/payment/request-payment`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          API_KEY: cfg.apiKey,
          API_SECRET: cfg.apiSecret,
        },
        body: JSON.stringify({
          item_name: libelle,
          // Integer XOF: PayTech refuses decimals.
          item_price: Math.floor(input.amount),
          currency: input.currency,
          // Our Order id: it comes back verbatim in the IPN.
          ref_command: input.externalRef,
          command_name: `${libelle} — commande ${input.externalRef}`,
          env: cfg.env,
          ipn_url: cfg.ipnUrl,
          success_url: input.successUrl,
          cancel_url: input.failureUrl,
          custom_field: JSON.stringify({ orderId: input.externalRef }),
        }),
        cache: 'no-store',
      });
      const texte = await r.text();
      let corps: { success?: unknown; token?: unknown; redirect_url?: unknown; message?: unknown };
      try {
        corps = JSON.parse(texte) as typeof corps;
      } catch {
        throw new PaytechError(`PayTech request-payment → ${r.status} (non-JSON)`, r.status);
      }
      // `success` is a NUMBER (1/0), not a boolean.
      if (Number(corps.success) !== 1 || typeof corps.token !== 'string') {
        throw new PaytechError(
          `PayTech request-payment refused: ${typeof corps.message === 'string' ? corps.message : r.status}`,
          r.status,
        );
      }
      return {
        providerChargeId: corps.token,
        paymentUrl:
          typeof corps.redirect_url === 'string'
            ? corps.redirect_url
            : `https://paytech.sn/payment/checkout/${corps.token}`,
        status: 'PENDING',
      };
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// IPN
// ───────────────────────────────────────────────────────────────────────

/** The IPN once its proof fields are removed — what is stored and handled. */
export interface PaytechIpn {
  type_event: string;
  ref_command: string;
  token: string;
  item_price: string;
  currency?: string;
  env?: string;
  payment_method?: string;
}

const CHAMPS_DE_PREUVE = ['hmac_compute', 'api_key_sha256', 'api_secret_sha256'] as const;

/** Form-encoded by default, JSON on some accounts: try JSON, else form. */
export function lireCorpsIpn(rawBody: Buffer): Record<string, string> {
  const texte = rawBody.toString('utf8');
  const debut = texte.trimStart();
  if (debut.startsWith('{')) {
    const j = JSON.parse(debut) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(j).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]),
    );
  }
  return Object.fromEntries(new URLSearchParams(texte));
}

function hex(algo: 'sha256', valeur: string): string {
  return createHash(algo).update(valeur).digest('hex');
}

function egal(a: string | undefined, b: string): boolean {
  if (typeof a !== 'string') return false;
  const x = Buffer.from(a.toLowerCase());
  const y = Buffer.from(b.toLowerCase());
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Verifies an IPN body. HMAC mode first (`hmac_compute` =
 * HMAC_SHA256(`${item_price}|${ref_command}|${apiKey}`, apiSecret)), then the
 * default SHA256-of-keys echo — both halves must match.
 */
export function verifierIpn(
  champs: Record<string, string>,
  apiKey: string,
  apiSecret: string,
): { valid: boolean; methode?: 'hmac' | 'sha256-cles'; reason?: string } {
  if (!apiKey || !apiSecret) return { valid: false, reason: 'paytech not configured' };

  if (champs.hmac_compute) {
    const message = `${champs.item_price ?? ''}|${champs.ref_command ?? ''}|${apiKey}`;
    const attendu = createHmac('sha256', apiSecret).update(message).digest('hex');
    if (egal(champs.hmac_compute, attendu)) return { valid: true, methode: 'hmac' };
  }
  if (
    egal(champs.api_key_sha256, hex('sha256', apiKey)) &&
    egal(champs.api_secret_sha256, hex('sha256', apiSecret))
  ) {
    return { valid: true, methode: 'sha256-cles' };
  }
  return { valid: false, reason: 'signature mismatch' };
}

export function genreEvenement(typeEvent: string): WebhookEventType {
  if (typeEvent === 'sale_complete') return 'paid';
  if (typeEvent === 'sale_canceled') return 'failed';
  if (typeEvent === 'refund_complete') return 'refunded';
  return 'other';
}

export function paytechWebhookProvider(
  lireCles: () => { apiKey: string; apiSecret: string },
): WebhookProvider<PaytechIpn> {
  return {
    name: 'paytech',
    verifySignature(rawBody: Buffer) {
      let champs: Record<string, string>;
      try {
        champs = lireCorpsIpn(rawBody);
      } catch {
        return { valid: false, reason: 'unparsable body' };
      }
      const { apiKey, apiSecret } = lireCles();
      return verifierIpn(champs, apiKey, apiSecret);
    },
    parsePayload(rawBody: Buffer): PaytechIpn {
      const champs = lireCorpsIpn(rawBody);
      for (const c of CHAMPS_DE_PREUVE) delete champs[c];
      if (!champs.type_event || !champs.ref_command || !champs.token) {
        throw new Error('PayTech IPN missing type_event/ref_command/token');
      }
      return {
        type_event: champs.type_event,
        ref_command: champs.ref_command,
        token: champs.token,
        item_price: champs.item_price ?? '',
        ...(champs.currency ? { currency: champs.currency } : {}),
        ...(champs.env ? { env: champs.env } : {}),
        ...(champs.payment_method ? { payment_method: champs.payment_method } : {}),
      };
    },
    extractIds(p: PaytechIpn): ParsedIds {
      return { externalId: p.token, eventType: p.type_event, kind: genreEvenement(p.type_event) };
    },
  };
}

/**
 * Does the IPN amount match the order? PayTech reports the item price we
 * sent; a small tolerance absorbs operator-fee rounding, never more.
 */
export function montantIpnAcceptable(itemPrice: string, montantCommande: number): boolean {
  const recu = Number.parseInt(itemPrice, 10);
  if (!Number.isFinite(recu) || montantCommande <= 0) return false;
  return recu >= Math.floor(montantCommande * 0.95) && recu <= montantCommande;
}
