// Plusieurs comptes sur un même appareil, et la bascule de l'un à l'autre.
//
// LE COFFRE. Le compte actif garde ses cookies habituels (accès, rafraîchis-
// sement, CSRF — lib/server/auth.ts, protégé et inchangé). Les AUTRES comptes
// de l'appareil vivent dans un cookie `<préfixe>-comptes`, httpOnly et limité
// à `/api/auth` comme le cookie de rafraîchissement : il contient leurs jetons
// de rafraîchissement, et rien d'autre.
//
// Pourquoi c'est sûr : ces jetons sont ceux que le navigateur détenait déjà.
// Ils sont sans état (voir api/auth/refresh), expirent au bout de 7 jours, et
// chaque bascule les revérifie entièrement — signature, `tokenVersion` (un
// changement de mot de passe les tue tous), compte suspendu. Le coffre ne
// donne accès à rien que l'appareil n'avait pas déjà.
//
// Ce module ne fait que manipuler la liste — pur et testé. La vérification
// cryptographique reste dans la route.

/** Au-delà, le plus ancien sort du coffre. Un cookie fait 4 Ko au plus. */
export const COMPTES_MAX = 5;

export interface EntreeCoffre {
  userId: string;
  jeton: string;
}

/** Lit la valeur brute du cookie. Tout ce qui n'a pas la bonne forme est ignoré. */
export function lireCoffre(brut: string | undefined | null): string[] {
  if (!brut) return [];
  try {
    const v: unknown = JSON.parse(brut);
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 2000)
      .slice(0, COMPTES_MAX);
  } catch {
    return [];
  }
}

export function ecrireCoffre(entrees: readonly EntreeCoffre[]): string {
  return JSON.stringify(entrees.slice(0, COMPTES_MAX).map((e) => e.jeton));
}

/**
 * Range un compte dans le coffre : en tête, sans doublon (un même compte n'y
 * figure qu'une fois, avec son jeton le plus récent), plafonné à COMPTES_MAX.
 * Le compte actif n'y est jamais : `exclure` le retire.
 */
export function ranger(
  coffre: readonly EntreeCoffre[],
  nouveau: EntreeCoffre | null,
  exclure?: string,
): EntreeCoffre[] {
  const tete = nouveau && nouveau.userId !== exclure ? [nouveau] : [];
  const reste = coffre.filter((e) => e.userId !== nouveau?.userId && e.userId !== exclure);
  return [...tete, ...reste].slice(0, COMPTES_MAX);
}

export function retirer(coffre: readonly EntreeCoffre[], userId: string): EntreeCoffre[] {
  return coffre.filter((e) => e.userId !== userId);
}

/**
 * Ce que l'écran montre d'un compte. Un partenaire invité n'a pas d'adresse
 * réelle (lib/couples/compte-invite.ts) : on ne l'affiche pas.
 */
export function libelleCompte(
  nom: string | null,
  email: string,
  estInvite: boolean,
): { titre: string; sousTitre: string } {
  const titre = nom?.trim() || (estInvite ? 'Partenaire invité' : email);
  return { titre, sousTitre: estInvite ? 'Compte invité, sans email' : email };
}
