// French, user-facing translations for the stable backend error codes
// used across the couple/invite pairing flow (see CLAUDE.md — "switch on
// `.code`, not on `.message`"). The API's `message` field is English and
// meant for logs/devs, not for display — several pages were rendering it
// raw to French-speaking users before this helper existed.
//
// Usage in a page's catch block:
//   setError(
//     err instanceof ApiError
//       ? (COUPLES_ERROR_MESSAGES[err.code] ?? err.message)
//       : 'Une erreur est survenue.',
//   );
export const COUPLES_ERROR_MESSAGES: Record<string, string> = {
  ALREADY_IN_COUPLE: 'Vous appartenez déjà à un Espace Couple.',
  INVITE_EXPIRED: "Ce lien d'invitation a expiré.",
  INVITE_NOT_FOUND: "Ce code d'invitation n'existe pas.",
  INVITE_ALREADY_USED: 'Cette invitation a déjà été utilisée.',
  CANNOT_JOIN_OWN_COUPLE: 'Vous ne pouvez pas rejoindre votre propre invitation.',
  TOO_MANY_JOIN_ATTEMPTS: 'Trop de tentatives. Réessayez dans une minute.',
  VALIDATION_FAILED: 'Le formulaire contient une erreur.',
  INVITE_CODE_GENERATION_FAILED: 'Une erreur est survenue lors de la création du code. Réessayez.',
  VERIFICATION_CODE_INVALID: 'Ce code de vérification est invalide.',
  VERIFICATION_CODE_EXPIRED: 'Ce code de vérification a expiré. Demandez-en un nouveau.',
  TOO_MANY_VERIFY_ATTEMPTS: 'Trop de tentatives. Réessayez dans quelques minutes.',
  TOO_MANY_INVITE_LOOKUPS: 'Trop de tentatives. Réessayez dans une minute.',
  // Login (/connexion)
  INVALID_CREDENTIALS: 'Email ou mot de passe incorrect.',
  LOCKED_OUT: 'Compte temporairement verrouillé. Réessayez plus tard.',
  EMAIL_NOT_VERIFIED: "Veuillez d'abord vérifier votre email.",
  ACCOUNT_SUSPENDED: 'Ce compte a été suspendu.',
  TOO_MANY_LOGIN_ATTEMPTS: 'Trop de tentatives. Réessayez dans une minute.',
  // Signup (/inscription) — password policy + rate limit
  PASSWORD_BANNED: 'Ce mot de passe est trop courant.',
  PASSWORD_TOO_SHORT: 'Mot de passe trop court.',
  PASSWORD_PWNED: 'Ce mot de passe a fuité — choisissez-en un autre.',
  TOO_MANY_SIGNUP_ATTEMPTS: 'Trop de tentatives. Réessayez plus tard.',
  // Password recovery (/mot-de-passe-oublie, /reinitialiser-mot-de-passe)
  // and verification resend. These codes come from `createEmailLimiter`'s
  // `code:` config rather than an `error:` literal in the route body, which
  // is why the mapping tripwire never saw them until its scan was widened —
  // every "trop de tentatives" answer here used to reach the user in
  // English.
  TOO_MANY_FORGOT_ATTEMPTS: 'Trop de demandes. Réessayez dans une heure.',
  TOO_MANY_RESET_ATTEMPTS: 'Trop de tentatives. Réessayez plus tard.',
  TOO_MANY_RESEND_ATTEMPTS: 'Trop d’envois. Réessayez dans quelques minutes.',
  // Emitted by /api/auth/resend-verification when Redis is absent: that
  // route fails CLOSED by design (a resend is too cheap to abuse without a
  // shared limiter). So this is not a transient blip that retrying fixes —
  // it means the deployment has no Upstash Redis configured — and the
  // wording deliberately promises no "réessayez dans un instant".
  RATE_LIMIT_UNAVAILABLE:
    'Le renvoi de code est indisponible pour le moment. Vérifiez vos spams, ou reprenez l’inscription.',
  // CSRF — `verifyCsrf` (auth.ts, protected) responds with
  // `{ error: 'Invalid CSRF token' }`, so that English sentence IS the
  // stable code the client receives. Mapping it here is the only way to
  // keep it off the screen without touching the protected module. In
  // practice it means a stale or missing cookie, which a reload fixes.
  'Invalid CSRF token': 'Votre session a expiré. Rechargez la page et réessayez.',
  // Jeu (/jeu) — moteur de partie pass-and-play
  NO_ACTIVE_COUPLE: "Vous n'avez pas encore d'Espace Couple.",
  DISCLAIMER_REQUIRED: 'Vous devez tous les deux accepter les règles du jeu avant de commencer.',
  // The one free game is per account: this partner has used theirs. The
  // wording says whose it was and what comes next, because 'refusé' with
  // no reason is how a player concludes the app is broken.
  FREE_GAME_USED:
    'Votre partie offerte a déjà été jouée. Les parties suivantes seront payantes — la recharge arrive bientôt.',
  // Volontairement neutre et unique : le backend renvoie NO_ACTIVE_GAME
  // aussi bien pour une partie inexistante que pour celle d'un autre
  // couple (Design Decision 5 — ne jamais révéler l'existence d'une
  // partie). Deux messages distincts recréeraient la fuite côté client.
  NO_ACTIVE_GAME: 'Aucune partie en cours.',
  INVALID_PHASE: "Cette action n'est pas possible à cette étape de la partie.",
  NOT_ANSWERING_PHASE: "Ce n'est pas le moment de répondre.",
  NOT_IN_ROUND_REVEAL: "La manche n'est pas encore terminée.",
  INVALID_OPTION: "Cette réponse n'est pas valide.",
  NO_JOKERS_LEFT: "Vous n'avez plus de joker pour cette partie.",
  INVALID_CATEGORIES: 'Cette sélection de thèmes est invalide. Choisissez à nouveau.',
  // Le palier du couple n'ouvre pas un des thèmes demandés. Le message ne
  // nomme pas lesquels : la réponse porte la liste dans `themes`, et
  // l'écran a déjà grisé les cartes concernées. Le dire une troisième fois
  // n'aiderait personne.
  THEME_LOCKED: 'Ce thème n’est pas inclus dans votre pack. Voir les packs pour l’ouvrir.',
  SALON_LOCKED: 'Le Salon est inclus dans les packs Essentiel, Intégral et Annuel.',
  // Rituel (/rituel) — la question du jour
  DEJA_REPONDU: 'Cette personne a déjà répondu aujourd’hui. Passez le téléphone à l’autre !',
  NO_DAILY_QUESTION: 'La question du jour n’est pas encore prête. Revenez un peu plus tard.',
  RESULTS_NOT_AVAILABLE: 'Aucun résultat disponible pour cette partie.',
  // Both emitted by GET /api/games/:id/rounds/:roundNumber. Like
  // NO_ACTIVE_GAME above, GAME_SESSION_NOT_FOUND covers both "no such
  // session" and "not yours" — the route returns an identical 404 for
  // each, and two distinct French messages would recreate client-side the
  // existence leak the server closes.
  GAME_SESSION_NOT_FOUND: 'Cette partie est introuvable.',
  ROUND_NOT_AVAILABLE: 'Cette manche n’est pas encore terminée.',
};

/**
 * Look up the French message for a stable backend error code, falling
 * back to the raw (English) message when the code isn't mapped — this
 * keeps unmapped/unexpected errors visible for debugging rather than
 * hiding them behind an overly generic string.
 */
export function coupleErrorMessage(code: string, fallbackMessage: string): string {
  return COUPLES_ERROR_MESSAGES[code] ?? fallbackMessage;
}
