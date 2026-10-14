// L'état de la chaîne de paiement, tel qu'un humain doit pouvoir le lire sans
// ouvrir une seule variable : quel prestataire, quel mode, et si l'adresse
// publique qui fabrique les URL de retour est utilisable.
//
// Deux pannes ont motivé ce module, toutes deux silencieuses :
//   - le 13/10/2026, `PUBLIC_URL` portait un BOM et PayTech refusait chaque
//     commande (422) — rien ne le disait nulle part ;
//   - un `PAYTECH_ENV=test` oublié en production encaisserait des paiements
//     fictifs, et aucun pack ne s'ouvrirait (l'IPN d'un autre environnement
//     est refusé, à raison).
// `/api/readyz` et le tableau de bord super-admin affichent ce qui suit.
//
// Pur : l'environnement est un paramètre.

export type EtatUrlPublique = 'ok' | 'absente' | 'invalide';

export interface EtatPaiement {
  fournisseur: 'paytech' | 'bictorys' | null;
  /** Le mode PayTech ; `null` quand PayTech n'est pas le prestataire. */
  mode: 'prod' | 'test' | null;
  urlPublique: EtatUrlPublique;
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * `PUBLIC_URL` nettoyée : sans BOM ni espace (`trim()` retire les deux), sans
 * barre finale. LA lecture de cette variable — la route des commandes passe
 * par ici, pour qu'il n'en existe pas une seconde qui oublierait de nettoyer.
 */
export function urlPubliqueNettoyee(brut: string | undefined): string | undefined {
  const propre = brut?.trim().replace(/\/+$/, '');
  return propre ? propre : undefined;
}

export function etatUrlPublique(brut: string | undefined, enProduction: boolean): EtatUrlPublique {
  const propre = urlPubliqueNettoyee(brut);
  if (!propre) return 'absente';
  let url: URL;
  try {
    url = new URL(propre);
  } catch {
    return 'invalide';
  }
  if (url.protocol === 'https:') return 'ok';
  return !enProduction && url.protocol === 'http:' ? 'ok' : 'invalide';
}

export function etatPaiement(env: Env, enProduction: boolean): EtatPaiement {
  const paytech = Boolean(env.PAYTECH_API_KEY?.trim() && env.PAYTECH_API_SECRET?.trim());
  const bictorys = Boolean(
    env.BICTORYS_API_URL?.trim() &&
    env.BICTORYS_API_KEY?.trim() &&
    env.BICTORYS_WEBHOOK_SECRET?.trim(),
  );
  return {
    fournisseur: paytech ? 'paytech' : bictorys ? 'bictorys' : null,
    // Même règle que `paytechEnv()` : tout ce qui n'est pas « test » vaut prod.
    mode: paytech ? (env.PAYTECH_ENV?.trim().toLowerCase() === 'test' ? 'test' : 'prod') : null,
    urlPublique: etatUrlPublique(env.PUBLIC_URL, enProduction),
  };
}

/** Les problèmes à afficher en alerte, en français. Vide si tout va bien. */
export function alertesPaiement(etat: EtatPaiement): string[] {
  const alertes: string[] = [];
  if (etat.fournisseur === null)
    alertes.push('Aucun prestataire de paiement configuré : personne ne peut acheter de pack.');
  if (etat.mode === 'test')
    alertes.push('PayTech est en mode TEST : aucun paiement réel n’est encaissé.');
  if (etat.urlPublique !== 'ok')
    alertes.push(
      `PUBLIC_URL est ${etat.urlPublique} : les URL de retour envoyées au prestataire ne fonctionnent pas.`,
    );
  return alertes;
}
