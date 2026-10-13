import { describe, it, expect } from 'vitest';
import { droitDeLaCommande, packEnVente, metadonneesDeCommande } from './achat';
import { PACKS, PACKS_PAYANTS, finDuDroit } from './packs';

const debut = new Date('2026-10-13T12:00:00Z');

describe('packEnVente', () => {
  it('rend chaque pack payant en vente', () => {
    for (const p of PACKS_PAYANTS) expect(packEnVente(p.id)?.id).toBe(p.id);
  });

  it('refuse le gratuit, un pack retiré de la vente et un identifiant inconnu', () => {
    expect(packEnVente('DECOUVERTE')).toBeNull();
    for (const p of PACKS.filter((x) => !x.enVente)) expect(packEnVente(p.id)).toBeNull();
    expect(packEnVente('GRATUIT_POUR_TOUJOURS')).toBeNull();
    expect(packEnVente(null)).toBeNull();
  });
});

describe('droitDeLaCommande', () => {
  const pack = PACKS_PAYANTS[0]!;
  const commande = {
    amount: pack.prix,
    currency: pack.devise,
    metadata: { ...metadonneesDeCommande(pack), idempotencyBodyHash: 'x' },
  };

  it('ouvre le pack payé, pour sa durée, à partir du paiement', () => {
    expect(droitDeLaCommande(commande, debut)).toEqual({
      packId: pack.id,
      expiresAt: finDuDroit(pack, debut),
    });
  });

  it("n'ouvre rien si le montant payé n'est pas le prix du pack", () => {
    expect(droitDeLaCommande({ ...commande, amount: 1 }, debut)).toBeNull();
    expect(droitDeLaCommande({ ...commande, amount: pack.prix + 1 }, debut)).toBeNull();
    expect(droitDeLaCommande({ ...commande, currency: 'EUR' }, debut)).toBeNull();
  });

  it("n'ouvre rien pour une commande sans pack", () => {
    expect(droitDeLaCommande({ ...commande, metadata: null }, debut)).toBeNull();
    expect(droitDeLaCommande({ ...commande, metadata: { autre: 1 } }, debut)).toBeNull();
    expect(droitDeLaCommande({ ...commande, metadata: { packId: 'INCONNU' } }, debut)).toBeNull();
    expect(
      droitDeLaCommande({ ...commande, metadata: { packId: 'DECOUVERTE' } }, debut),
    ).toBeNull();
  });
});
