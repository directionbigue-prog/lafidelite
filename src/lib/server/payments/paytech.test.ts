import { describe, it, expect } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import {
  genreEvenement,
  lireCorpsIpn,
  montantIpnAcceptable,
  paytechWebhookProvider,
  verifierIpn,
} from './paytech';

const KEY = 'cle-api-test';
const SECRET = 'secret-api-test';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

function ipnForm(champs: Record<string, string>): Buffer {
  return Buffer.from(new URLSearchParams(champs).toString());
}

const base = {
  type_event: 'sale_complete',
  ref_command: 'order-1',
  token: 'T_abc',
  item_price: '4900',
  currency: 'XOF',
  env: 'prod',
  payment_method: 'Wave',
};

describe('verifierIpn', () => {
  it('accepte le mode par défaut (empreintes SHA-256 des deux clés)', () => {
    const r = verifierIpn(
      { ...base, api_key_sha256: sha(KEY), api_secret_sha256: sha(SECRET) },
      KEY,
      SECRET,
    );
    expect(r).toEqual({ valid: true, methode: 'sha256-cles' });
  });

  it('accepte le mode HMAC : item_price|ref_command|apiKey, signé par apiSecret', () => {
    const hmac = createHmac('sha256', SECRET).update(`4900|order-1|${KEY}`).digest('hex');
    expect(verifierIpn({ ...base, hmac_compute: hmac }, KEY, SECRET).methode).toBe('hmac');
  });

  it('refuse une clé fausse, une seule moitié, ou rien', () => {
    expect(verifierIpn({ ...base, api_key_sha256: sha(KEY) }, KEY, SECRET).valid).toBe(false);
    expect(
      verifierIpn(
        { ...base, api_key_sha256: sha('x'), api_secret_sha256: sha(SECRET) },
        KEY,
        SECRET,
      ).valid,
    ).toBe(false);
    expect(verifierIpn({ ...base, hmac_compute: 'faux' }, KEY, SECRET).valid).toBe(false);
    expect(verifierIpn(base, '', '').valid).toBe(false);
  });
});

describe('lireCorpsIpn', () => {
  it('lit un IPN en formulaire (le défaut de PayTech) comme en JSON', () => {
    expect(lireCorpsIpn(ipnForm(base)).item_price).toBe('4900');
    expect(
      lireCorpsIpn(Buffer.from(JSON.stringify({ ...base, item_price: 4900 }))).item_price,
    ).toBe('4900');
  });
});

describe('le fournisseur de webhook', () => {
  const p = paytechWebhookProvider(() => ({ apiKey: KEY, apiSecret: SECRET }));
  const signe = ipnForm({ ...base, api_key_sha256: sha(KEY), api_secret_sha256: sha(SECRET) });

  it('vérifie, puis retire les champs de preuve avant stockage', () => {
    expect(p.verifySignature(signe, {}).valid).toBe(true);
    const payload = p.parsePayload(signe) as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty('api_key_sha256');
    expect(payload).not.toHaveProperty('api_secret_sha256');
    expect(p.extractIds(p.parsePayload(signe))).toEqual({
      externalId: 'T_abc',
      eventType: 'sale_complete',
      kind: 'paid',
    });
  });

  it('associe chaque événement à son genre', () => {
    expect(genreEvenement('sale_canceled')).toBe('failed');
    expect(genreEvenement('refund_complete')).toBe('refunded');
    expect(genreEvenement('autre')).toBe('other');
  });
});

describe('montantIpnAcceptable', () => {
  it('accepte le prix exact et une petite marge de frais, jamais plus que la commande', () => {
    expect(montantIpnAcceptable('4900', 4900)).toBe(true);
    expect(montantIpnAcceptable('4700', 4900)).toBe(true);
    expect(montantIpnAcceptable('100', 4900)).toBe(false);
    expect(montantIpnAcceptable('9900', 4900)).toBe(false);
    expect(montantIpnAcceptable('abc', 4900)).toBe(false);
  });
});
