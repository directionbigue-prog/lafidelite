// Compter les connexions Google sans toucher au retour OAuth (protégé).
//
// `app/api/auth/oauth/google/callback/route.ts` figure dans la liste des
// fichiers protégés de CLAUDE.md : il émet les cookies puis redirige vers le
// `next` choisi au départ. On ne l'ouvre pas pour une statistique. À la
// place, chaque bouton Google demande comme `next` un RELAIS —
// `/api/auth/connexion-google?next=<destination>` — qui enregistre la
// connexion puis renvoie vers la destination réelle. Le callback ne change
// pas, et `isSameOriginNext` y valide déjà le relais comme n'importe quel
// chemin du site.
//
// Le relais ne compte qu'un jeton d'accès FRAIS (émis il y a moins de deux
// minutes, donc par le callback qui précède) : rouvrir l'adresse à la main
// plus tard ne gonfle pas les chiffres.

export const RELAIS_GOOGLE = '/api/auth/connexion-google';

/** L'adresse de départ d'un bouton « Continuer avec Google ». */
export function lienConnexionGoogle(destination: string): string {
  const relais = `${RELAIS_GOOGLE}?next=${encodeURIComponent(destination)}`;
  return `/api/auth/oauth/google/start?next=${encodeURIComponent(relais)}`;
}

/**
 * Où le relais renvoie. Un chemin du site seulement : ni `//hôte` (adresse
 * relative au protocole, la redirection ouverte classique), ni schéma, ni
 * antislash, ni le relais lui-même (qui bouclerait).
 */
export function destinationSure(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/jeu';
  if (next.includes('\\') || /^\/[a-z][a-z0-9+.-]*:/i.test(next)) return '/jeu';
  if (next === RELAIS_GOOGLE || next.startsWith(`${RELAIS_GOOGLE}?`)) return '/jeu';
  return next;
}

/** Le jeton a-t-il été émis à l'instant (par le retour Google qui précède) ? */
export function jetonFrais(iat: unknown, maintenantMs: number, fenetreMs = 120_000): boolean {
  if (typeof iat !== 'number' || !Number.isFinite(iat)) return false;
  const age = maintenantMs - iat * 1000;
  return age >= -5_000 && age <= fenetreMs;
}
