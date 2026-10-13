// Le pack qu'un visiteur a choisi AVANT d'avoir une session.
//
// Un clic sur une carte de pack doit finir sur la page de paiement PayTech.
// Connecté, c'est immédiat (`/acheter/[pack]` lance la commande). Sans
// session, il faut d'abord s'inscrire ou se connecter — et le choix ne doit
// pas se perdre en route, sinon le visiteur atterrit sur /jeu sans savoir où
// est passé le pack qu'il voulait payer.
//
// Deux porteurs, parce qu'aucun ne suffit seul :
//   - `?next=/acheter/X`, propagé par /connexion et /inscription → /verify-email ;
//   - une mémoire locale (localStorage), pour le seul chemin qui perd le
//     `next` : le lien du mail de vérification, ouvert dans un autre onglet.
// La mémoire expire après une heure : un choix vieux d'hier ne doit pas
// ouvrir une caisse à la connexion suivante.
import { destinationSure } from '@/lib/auth/lien-google';
import { estAchetable, packParId } from '@/lib/game/packs';

export const CLE_PACK_CHOISI = 'cf-pack-choisi';
export const VALIDITE_PACK_CHOISI_MS = 60 * 60 * 1000;

/** L'adresse qui ouvre le paiement d'un pack. */
export function cheminAchat(packId: string): string {
  return `/acheter/${encodeURIComponent(packId)}`;
}

export function serialiserPackChoisi(packId: string, maintenant: number): string {
  return JSON.stringify({ pack: packId, at: maintenant });
}

/** Le pack mémorisé, s'il est encore achetable et choisi il y a moins d'une heure. */
export function lirePackChoisi(brut: string | null, maintenant: number): string | null {
  if (!brut) return null;
  let valeur: unknown;
  try {
    valeur = JSON.parse(brut);
  } catch {
    return null;
  }
  const { pack, at } = (valeur ?? {}) as { pack?: unknown; at?: unknown };
  if (typeof pack !== 'string' || typeof at !== 'number') return null;
  const age = maintenant - at;
  if (age < 0 || age > VALIDITE_PACK_CHOISI_MS) return null;
  return estAchetable(packParId(pack)) ? pack : null;
}

/**
 * Où aller une fois la session ouverte.
 *
 * Un `next` explicite gagne (validé : un chemin du site seulement). À
 * défaut, un pack choisi récemment mène à son paiement. Sinon, `/jeu`, qui
 * sait router chaque état de couple.
 */
export function destinationApresConnexion(
  next: string | null | undefined,
  packMemorise: string | null,
): string {
  if (next) return destinationSure(next);
  return packMemorise ? cheminAchat(packMemorise) : '/jeu';
}

// ── Accès au navigateur ─────────────────────────────────────────────────
// Chaque accès est enveloppé : un stockage bloqué (navigation privée,
// réglages) coûte la mémoire du choix, jamais la connexion.

export function memoriserPackChoisi(packId: string): void {
  try {
    globalThis.localStorage?.setItem(CLE_PACK_CHOISI, serialiserPackChoisi(packId, Date.now()));
  } catch {
    // stockage indisponible : le `next` de l'URL reste le porteur principal
  }
}

export function packChoisiMemorise(): string | null {
  try {
    return lirePackChoisi(globalThis.localStorage?.getItem(CLE_PACK_CHOISI) ?? null, Date.now());
  } catch {
    return null;
  }
}

export function oublierPackChoisi(): void {
  try {
    globalThis.localStorage?.removeItem(CLE_PACK_CHOISI);
  } catch {
    // rien à faire
  }
}
