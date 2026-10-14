// Les variables d'environnement telles que le SERVEUR les voit — et ce qui
// cloche dedans.
//
// POURQUOI CE MODULE EXISTE. Le 13/10/2026, tous les achats de pack ont
// échoué : `PUBLIC_URL` commençait en production par un BOM (U+FEFF), écrit
// par PowerShell au moment où la variable avait été posée. Invisible dans le
// tableau de bord de Vercel, invisible dans les logs, et indétectable depuis
// l'extérieur : Vercel ne laisse relire aucune variable de type « Secret ». Le
// seul endroit qui voit la vraie valeur est le serveur en marche. C'est donc
// lui qui l'examine, et `/api/readyz` + le tableau de bord super-admin qui le
// disent.
//
// Ce module ne rend JAMAIS une valeur, ni un préfixe, ni une longueur : seuls
// le NOM de la variable et la nature du défaut sortent d'ici.
//
// Pur : aucune lecture de `process.env` hors des paramètres, pour être testé.

export type DefautDeVariable = 'BOM' | 'invisible' | 'espace' | 'guillemets';

/**
 * Les variables du produit. Tenue à la main, et tenue à jour par un test :
 * toute variable de `.env.example` doit y figurer, sinon CI échoue.
 */
export const VARIABLES_SURVEILLEES = [
  'ALLOWED_ORIGINS',
  'APP_URL',
  'AUTH_FORGOT_RATE_LIMIT_MAX',
  'AUTH_FORGOT_TARGET_LATENCY_MS',
  'AUTH_LOCKOUT_DURATION_MIN',
  'AUTH_LOCKOUT_THRESHOLD',
  'AUTH_LOGIN_RATE_LIMIT_MAX',
  'AUTH_PASSWORD_MIN_LENGTH',
  'AUTH_RATE_LIMIT_FAIL_CLOSED',
  'AUTH_RESEND_VERIFY_RATE_LIMIT_MAX',
  'AUTH_RESET_RATE_LIMIT_MAX',
  'AUTH_SIGNUP_RATE_LIMIT_MAX',
  'AUTH_VERIFICATION_TTL_MIN',
  'AUTH_VERIFY_RATE_LIMIT_MAX',
  'BANANI_API_KEY',
  'BICTORYS_API_KEY',
  'BICTORYS_API_URL',
  'BICTORYS_MERCHANT_SECRET_CODE',
  'BICTORYS_PRIVATE_KEY',
  'BICTORYS_RETRY_DELAYS_MS_OVERRIDE',
  'BICTORYS_WEBHOOK_REPLAY_WINDOW_MS',
  'BICTORYS_WEBHOOK_SECRET',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_UPLOAD_PRESET',
  'COMMISSION_RATE_BP',
  'CONNEXION_RETENTION_DAYS',
  'COOKIE_DOMAIN',
  'COOKIE_PREFIX',
  'CRON_SECRET',
  'DATABASE_URL',
  'DIRECT_URL',
  'EMAIL_FROM',
  'ENCRYPTION_KEY',
  'FREE_GAME_EXEMPT_EMAILS',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'JWT_SECRET',
  'NEXT_PUBLIC_COOKIE_PREFIX',
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_ENVIRONMENT',
  'NEXT_PUBLIC_SENTRY_RELEASE',
  'NEXT_PUBLIC_SENTRY_REPLAYS_SAMPLE_RATE',
  'NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE',
  'NODE_ENV',
  'ORDER_EXPIRATION_MINUTES',
  'PASSWORD_HIBP_CHECK',
  'PAYTECH_API_KEY',
  'PAYTECH_API_SECRET',
  'PAYTECH_ENV',
  'PUBLIC_URL',
  'RESEND_API_KEY',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_DSN',
  'SENTRY_ENVIRONMENT',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'SENTRY_RELEASE',
  'SENTRY_TRACES_SAMPLE_RATE',
  'SMOKE_BASE_URL',
  'SMOKE_BYPASS_WEBHOOK_VERIFY',
  'UPLOAD_ALLOWED_MIME',
  'UPLOAD_MAX_BYTES',
  'UPSTASH_REDIS_REST_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'WEBHOOK_LOG_RETENTION_DAYS',
  'WITHDRAWAL_BALANCE_CHECK',
  'WITHDRAWAL_COOLDOWN_HOURS',
  'WITHDRAWAL_DAILY_LIMIT',
  'WITHDRAWAL_MAX_AMOUNT',
  'WITHDRAWAL_MIN_AMOUNT',
  'WITHDRAWAL_REQUIRE_PIN',
] as const;

const BOM = '\uFEFF';
// Espaces de largeur nulle, joint de mots, espace insécable : rien ne les
// distingue à l'œil d'une valeur propre.
const INVISIBLES = /[\u200B-\u200D\u2060\u00A0]/;

/** Ce qui cloche dans une valeur — liste vide si elle est propre. */
export function defautsDeValeur(valeur: string): DefautDeVariable[] {
  const defauts: DefautDeVariable[] = [];
  if (valeur.includes(BOM)) defauts.push('BOM');
  if (INVISIBLES.test(valeur)) defauts.push('invisible');
  // Espace, tabulation ou retour à la ligne en tête ou en queue — le BOM mis
  // à part, il a déjà son nom.
  const sansBom = valeur.split(BOM).join('');
  if (sansBom !== sansBom.trim()) defauts.push('espace');
  // Une valeur entièrement entre guillemets : les guillemets ont été collés
  // avec elle. `"Cœur Fidèle" <noreply@…>` n'en est pas une.
  if (sansBom.length >= 2 && /^(["'])[\s\S]*\1$/.test(sansBom.trim())) defauts.push('guillemets');
  return defauts;
}

export interface VariableSuspecte {
  variable: string;
  defauts: DefautDeVariable[];
}

/** Les variables surveillées qui portent un défaut. Une variable absente n'en est pas une. */
export function diagnostiquerEnvironnement(
  env: Readonly<Record<string, string | undefined>>,
  noms: readonly string[] = VARIABLES_SURVEILLEES,
): VariableSuspecte[] {
  const suspectes: VariableSuspecte[] = [];
  for (const variable of noms) {
    const valeur = env[variable];
    if (valeur === undefined || valeur === '') continue;
    const defauts = defautsDeValeur(valeur);
    if (defauts.length > 0) suspectes.push({ variable, defauts });
  }
  return suspectes;
}

/** Une ligne lisible pour un humain : « CRON_SECRET (BOM, espace) ». */
export function libelleSuspecte(s: VariableSuspecte): string {
  return `${s.variable} (${s.defauts.join(', ')})`;
}
