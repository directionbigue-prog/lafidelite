// De quelle adresse publique l'application se croit-elle servie ?
//
// Pourquoi ce module existe. `APP_URL` valait `http://localhost:3000` sur le
// site en production le 02/10/2026 — mesuré, pas supposé : le redirect d'erreur
// OAuth renvoyait vers `http://localhost:3000/auth/error`. Conséquence qui ne
// se voit sur aucun tableau de bord : `POST /api/couples` fabriquait
// `inviteUrl: http://localhost:3000/invite/<code>`. Le partenaire recevait un
// lien qui ne mène nulle part, donc l'appariement — la boucle centrale du
// produit — était impossible, sur un déploiement vert.
//
// La leçon n'est pas « il fallait poser la variable ». C'est qu'une variable
// d'environnement oubliée ne doit pas pouvoir casser silencieusement un lien
// destiné à un tiers. Une requête HTTP sait déjà sur quel domaine elle arrive ;
// s'en servir ne demande aucun réglage et ne peut pas être oublié.
//
// Sur la lecture de l'en-tête `Host` pour construire des liens : c'est une
// source de « host header injection » sur un serveur générique. Ici deux choses
// la bornent. D'abord on lit `x-forwarded-host`, posé par le proxy de Vercel,
// avant `host`. Ensuite, chez Vercel une requête n'atteint le projet que si son
// hôte correspond à un domaine rattaché au projet ou à une URL de déploiement :
// l'ensemble des valeurs possibles est donc déjà limité à des domaines que le
// propriétaire contrôle. Si vous hébergez ailleurs derrière un proxy qui laisse
// passer n'importe quel `Host`, posez `APP_URL` : elle garde la priorité.

const LOCALHOST = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i;

/** L'adresse de repli, en développement uniquement. */
export const ORIGINE_DEV = 'http://localhost:3000';

export interface EntreesOrigine {
  /** `process.env.APP_URL`. Prioritaire si elle est utilisable. */
  appUrl?: string | undefined;
  /**
   * L'URL de production que l'hébergeur annonce de lui-même.
   *
   * Deux sources selon l'hôte, et c'est pourquoi ce champ ne nomme plus l'un
   * des deux : `URL` chez Netlify (schéma inclus, domaine personnalisé compris)
   * et `VERCEL_PROJECT_PRODUCTION_URL` chez Vercel (sans schéma). Les deux
   * formes sont tolérées ici.
   */
  urlProductionHote?: string | undefined;
  /** `x-forwarded-host`, posé par le proxy. Peut être une liste. */
  forwardedHost?: string | null | undefined;
  /** `x-forwarded-proto`. Peut être une liste. */
  forwardedProto?: string | null | undefined;
  /** `host`, en dernier recours. */
  host?: string | null | undefined;
  /** Tourne-t-on en production ? Décide si un `APP_URL` local est crédible. */
  enProduction?: boolean;
}

/** Un en-tête transféré peut contenir « a, b » : seule la première valeur compte. */
function premiere(valeur: string | null | undefined): string | null {
  if (!valeur) return null;
  const v = valeur.split(',')[0]?.trim();
  return v ? v : null;
}

function estLocal(hote: string): boolean {
  return LOCALHOST.test(hote);
}

/** Retire le `/` final pour que `${origine}/chemin` ne produise jamais `//`. */
function normaliser(origine: string): string {
  return origine.replace(/\/+$/, '');
}

/**
 * `APP_URL` est-elle utilisable ?
 *
 * Non si elle est vide, non si elle n'est pas une URL absolue valide, et non si
 * elle désigne localhost **alors qu'on tourne en production** — c'est le cas
 * exact qui a cassé les invitations, et le seul où ignorer une configuration
 * explicite est plus sûr que de la respecter.
 */
export function urlPubliqueCredible(
  valeur: string | undefined,
  enProduction: boolean,
): string | null {
  const brut = valeur?.trim();
  if (!brut) return null;
  let u: URL;
  try {
    u = new URL(brut);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (enProduction && estLocal(u.host)) return null;
  // Rendue VERBATIM, sans normalisation : une URI de redirection OAuth doit
  // correspondre au caractère près à celle enregistrée chez le fournisseur.
  // Normaliser « https://x.test » en « https://x.test/ » suffirait à produire
  // un redirect_uri_mismatch.
  return brut;
}

function appUrlUtilisable(appUrl: string | undefined, enProduction: boolean): string | null {
  const credible = urlPubliqueCredible(appUrl, enProduction);
  if (!credible) return null;
  return normaliser(new URL(credible).origin);
}

/** Le chemin du callback OAuth Google, en un seul endroit. */
export const CHEMIN_CALLBACK_GOOGLE = '/api/auth/oauth/google/callback';

/**
 * L'URI de callback Google déduite de la requête en cours.
 *
 * `start` et `callback` DOIVENT produire la même chaîne : Google compare l'URI
 * de l'échange du code à celle de l'autorisation, et refuse si elles diffèrent.
 * Les deux routes reçoivent une requête sur le même hôte, donc elles déduisent
 * la même valeur.
 */
export function callbackGoogleDepuis(headers: Headers): string {
  return origineDepuis(headers) + CHEMIN_CALLBACK_GOOGLE;
}

/**
 * Résout l'origine publique, par ordre de fiabilité décroissante.
 *
 * 1. `APP_URL`, si elle est absolue et pas locale-en-production. Une
 *    configuration explicite et crédible gagne toujours.
 * 2. L'hôte de la requête (`x-forwarded-host`, sinon `host`). C'est le domaine
 *    que l'utilisateur a réellement sous les yeux, donc celui sur lequel un
 *    lien d'invitation doit pointer. Ne demande aucun réglage.
 * 3. L'URL de production annoncée par l'hébergeur, pour les contextes sans
 *    requête : crons et envoi différé des mails depuis l'outbox. C'est `URL`
 *    chez Netlify, `VERCEL_PROJECT_PRODUCTION_URL` chez Vercel. Son rang vient
 *    de ce qu'on ne peut la supposer présente ni dans un cas ni dans l'autre :
 *    chez Vercel elle dépend de la case « Enable access to System Environment
 *    Variables », et chez Netlify du scope accordé à la variable.
 * 4. `http://localhost:3000`, développement.
 *
 * Le schéma vient de `x-forwarded-proto` ; à défaut on déduit `http` pour un
 * hôte local et `https` ailleurs — déduire `https` partout donnerait
 * `https://localhost:3000` en développement, qui ne répond pas.
 */
export function resoudreOrigine(e: EntreesOrigine = {}): string {
  const enProduction = e.enProduction ?? false;

  const configuree = appUrlUtilisable(e.appUrl, enProduction);
  if (configuree) return configuree;

  const hote = premiere(e.forwardedHost) ?? premiere(e.host);
  if (hote) {
    const proto = premiere(e.forwardedProto) ?? (estLocal(hote) ? 'http' : 'https');
    return normaliser(`${proto}://${hote}`);
  }

  const annoncee = e.urlProductionHote?.trim();
  if (annoncee) {
    // Chez Vercel la variable ne porte pas le schéma, chez Netlify elle le
    // porte. On normalise dans les deux sens plutôt que de produire
    // « https://https://… » sur une variable recopiée.
    const sansSchema = annoncee.replace(/^https?:\/\//, '');
    if (sansSchema) return normaliser(`https://${sansSchema}`);
  }

  return ORIGINE_DEV;
}

/**
 * La même décision, à partir des en-têtes d'une requête et de l'environnement.
 *
 * C'est la forme que les Route Handlers appellent : `origineDepuis(req.headers)`.
 */
export function origineDepuis(headers: Headers): string {
  return resoudreOrigine({
    appUrl: process.env.APP_URL,
    urlProductionHote: process.env.URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL,
    forwardedHost: headers.get('x-forwarded-host'),
    forwardedProto: headers.get('x-forwarded-proto'),
    host: headers.get('host'),
    enProduction: process.env.NODE_ENV === 'production',
  });
}

/**
 * L'origine quand il n'y a aucune requête : cron, vidange de l'outbox, script.
 *
 * Ici il n'y a pas d'hôte à lire, donc l'URL annoncée par l'hébergeur (`URL`
 * chez Netlify, `VERCEL_PROJECT_PRODUCTION_URL` chez Vercel) devient la seule
 * source automatique. Si elle manque et qu'`APP_URL` est absente ou locale, on
 * retombe sur le développement — et un lien de production sera faux.
 * C'est pourquoi `APP_URL` reste la bonne chose à poser, même avec ce module.
 */
export function origineSansRequete(): string {
  return resoudreOrigine({
    appUrl: process.env.APP_URL,
    urlProductionHote: process.env.URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL,
    enProduction: process.env.NODE_ENV === 'production',
  });
}
