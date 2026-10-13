// L'écran de retour de paiement (/paiement/[id]) : quoi dire, et quand
// arrêter d'attendre.
//
// Bictorys renvoie le client ici, souvent AVANT que son webhook n'ait passé
// la commande à PAID. L'écran ne croit donc pas le paramètre `issue` de
// l'URL — n'importe qui peut le taper — et relit la commande jusqu'à ce
// qu'elle soit tranchée, ou que l'attente devienne déraisonnable.

export interface CommandeLue {
  status: string;
  droit: { packId: string; status: string; expiresAt: string } | null;
}

export type EtatRetour =
  | { kind: 'ouvert'; packId: string; expiresAt: string }
  | { kind: 'paye-sans-droit' }
  | { kind: 'attente' }
  | { kind: 'echec' }
  | { kind: 'trop-long' };

/** Au-delà, on cesse de relire et on dit au client quoi faire. */
export const TENTATIVES_MAX = 40; // × 3 s ≈ 2 minutes

export function etatDuRetour(commande: CommandeLue, tentatives: number): EtatRetour {
  if (commande.status === 'PAID') {
    return commande.droit && commande.droit.status === 'ACTIVE'
      ? { kind: 'ouvert', packId: commande.droit.packId, expiresAt: commande.droit.expiresAt }
      : { kind: 'paye-sans-droit' };
  }
  if (commande.status === 'PENDING') {
    return tentatives >= TENTATIVES_MAX ? { kind: 'trop-long' } : { kind: 'attente' };
  }
  return { kind: 'echec' };
}

/** Faut-il relire la commande ? Seulement tant qu'elle n'est pas tranchée. */
export function doitRelire(etat: EtatRetour): boolean {
  return etat.kind === 'attente';
}
