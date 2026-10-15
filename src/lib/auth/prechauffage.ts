// Réveiller la base pendant que la personne choisit son compte chez Google.
//
// Mesuré en production le 15/10/2026 : après quelques minutes sans trafic,
// le premier accès à la base coûte de 0,7 à 7 s (réveil du calcul Neon, mis
// en veille après 5 min d'inactivité, puis connexion de Prisma), contre
// ~60 ms à chaud. La fonction elle-même, grâce à Fluid compute, reste
// presque chaude (~0,4 s contre ~0,2 s). Or le retour Google
// (`oauth/google/callback`, protégé) est précisément le PREMIER accès base
// d'une connexion Google : la personne revient de Google et attend ce réveil
// devant une page blanche.
//
// Le bouton Google appelle donc `prechaufferServeur()` à l'affichage et au
// clic : les secondes passées sur l'écran de Google servent à réveiller la
// base, et le callback la trouve prête. La requête part sans cookie, sa
// réponse n'est jamais attendue, et `keepalive` la laisse partir même quand
// la page change aussitôt — ce qui est le cas au clic.

export const ROUTE_PRECHAUFFAGE = '/api/prechauffage';

/**
 * Sous les 5 min de mise en veille de Neon : un réveil plus récent que cela
 * suffit, inutile d'en relancer un à chaque rendu ou à chaque clic.
 */
export const INTERVALLE_PRECHAUFFAGE_MS = 4 * 60_000;

type Envoyer = (url: string, init: RequestInit) => unknown;

let dernierEnvoi = Number.NEGATIVE_INFINITY;

/**
 * Lance un réveil du serveur, au plus une fois par intervalle.
 * Ne lève jamais d'erreur : un préchauffage raté ne coûte rien.
 * @returns `true` si une requête est partie.
 */
export function prechaufferServeur(
  maintenant: number = Date.now(),
  envoyer: Envoyer = (url, init) => fetch(url, init),
): boolean {
  if (maintenant - dernierEnvoi < INTERVALLE_PRECHAUFFAGE_MS) return false;
  dernierEnvoi = maintenant;
  try {
    const reponse = envoyer(ROUTE_PRECHAUFFAGE, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      keepalive: true,
    });
    if (reponse instanceof Promise) reponse.catch(() => undefined);
  } catch {
    // `fetch` absent ou refusé : la connexion se fera simplement à froid.
  }
  return true;
}

/** Pour les tests uniquement. */
export function _reinitialiserPrechauffage(): void {
  dernierEnvoi = Number.NEGATIVE_INFINITY;
}
