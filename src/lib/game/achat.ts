// L'achat d'un pack : ce que la commande porte, et le droit qu'elle ouvre.
//
// Deux décisions, toutes deux prises ICI et nulle part ailleurs :
//
//   1. Le prix vient du registre, jamais du client. POST /api/orders reçoit
//      un `packId` et en déduit montant et devise ; un montant envoyé par le
//      navigateur est ignoré. Sans cela, n'importe qui payait 1 FCFA un mois.
//
//   2. Le webhook n'ouvre un droit que si la commande payée correspond
//      EXACTEMENT au prix du pack qu'elle nomme. Une commande générique
//      (sans `packId`, l'API héritée du starter) ou dont le montant ne
//      correspond pas ne donne rien — elle reste visible au back-office.
//
// Module pur : testé directement, lu par la route et par le webhook.
import { estAchetable, finDuDroit, packParId, type Pack } from './packs';

/** Le pack qu'on peut acheter sous cet identifiant, ou null. */
export function packEnVente(packId: string | null | undefined): Pack | null {
  const pack = packParId(packId);
  return pack && estAchetable(pack) && pack.prix > 0 ? pack : null;
}

/** Ce qu'une commande de pack enregistre dans `Order.metadata`. */
export function metadonneesDeCommande(pack: Pack): { packId: string } {
  return { packId: pack.id };
}

export interface CommandePayee {
  amount: number;
  currency: string;
  metadata: unknown;
}

/**
 * Le droit qu'ouvre une commande payée, ou null si elle n'en ouvre aucun.
 *
 * `packParId` et non `packEnVente` : un pack retiré de la vente pendant que
 * le client était sur la page de paiement reste dû — il a payé le prix
 * affiché, on ne le lui refuse pas après coup.
 */
export function droitDeLaCommande(
  commande: CommandePayee,
  debut: Date,
): { packId: string; expiresAt: Date } | null {
  const meta = commande.metadata;
  const packId =
    meta && typeof meta === 'object' && 'packId' in meta
      ? (meta as { packId?: unknown }).packId
      : undefined;
  if (typeof packId !== 'string') return null;

  const pack = packParId(packId);
  if (!pack || pack.prix <= 0) return null;
  if (commande.amount !== pack.prix || commande.currency !== pack.devise) return null;

  return { packId: pack.id, expiresAt: finDuDroit(pack, debut) };
}
