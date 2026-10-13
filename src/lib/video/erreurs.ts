// Ce que l'appel vidéo dit quand il échoue — une phrase qui dit QUOI faire.
//
// LE DÉFAUT QU'IL CORRIGE (constaté le 13/10/2026) : toute erreur de Daily
// s'affichait « L'appel a été interrompu. Vérifiez votre connexion… ». La
// vraie cause était `account-missing-payment-method` — le compte Daily n'avait
// pas de moyen de paiement, et Daily refusait toute entrée en salle. Un
// message de réseau sur une erreur de compte envoie chercher au mauvais
// endroit : aucune salle n'avait jamais accueilli personne, et rien ne le
// disait.
//
// Pur et isomorphe : testé sans navigateur, lu par VideoContext.

import { ApiError } from '@/lib/api';
import { gameErrorMessage } from '@/lib/game/api-result';

/** Le code ou le texte d'erreur que porte ce que Daily (ou le navigateur) a levé. */
export function codeErreurAppel(err: unknown): string {
  if (typeof err === 'string') return err;
  if (!err || typeof err !== 'object') return '';
  const e = err as {
    errorMsg?: unknown;
    message?: unknown;
    name?: unknown;
    error?: { type?: unknown; msg?: unknown } | unknown;
  };
  const morceaux: string[] = [];
  for (const v of [e.errorMsg, e.message, e.name]) if (typeof v === 'string') morceaux.push(v);
  if (e.error && typeof e.error === 'object') {
    const d = e.error as { type?: unknown; msg?: unknown };
    for (const v of [d.type, d.msg]) if (typeof v === 'string') morceaux.push(v);
  } else if (typeof e.error === 'string') {
    morceaux.push(e.error);
  }
  return morceaux.join(' ');
}

const REGLES: readonly [RegExp, string][] = [
  [
    /account-missing-payment-method|payment/i,
    'L’appel vidéo n’est pas encore activé sur Cœur Fidèle : le compte du service vidéo doit être complété. Réessayez un peu plus tard.',
  ],
  [
    /permission|NotAllowed|not-allowed|denied/i,
    'Autorisez la caméra et le micro dans votre navigateur pour lancer l’appel.',
  ],
  [
    /NotFound|not-found|no device|devices? (?:not|missing)/i,
    'Aucune caméra ni micro trouvé sur cet appareil.',
  ],
  [
    /in-use|NotReadable|could not start/i,
    'La caméra ou le micro est déjà utilisé par une autre application. Fermez-la puis relancez l’appel.',
  ],
  [
    /full|max(?:imum)? participants/i,
    'L’appel est déjà ouvert sur deux appareils. Raccrochez sur l’autre appareil puis relancez.',
  ],
  [/exp-token|exp-room|expired|eject/i, 'L’appel a expiré. Relancez-le.'],
];

export const MESSAGE_APPEL_PAR_DEFAUT =
  'L’appel n’a pas pu démarrer. Vérifiez votre connexion et réessayez.';

/**
 * La phrase à montrer. Une erreur de NOTRE API (pas de couple actif, vidéo
 * non configurée…) porte un code stable et garde sa traduction habituelle ;
 * une erreur de Daily ou du navigateur passe par les règles ci-dessus.
 */
export function messageErreurAppel(err: unknown): string {
  if (err instanceof ApiError) return gameErrorMessage(err);
  const texte = codeErreurAppel(err);
  for (const [motif, message] of REGLES) if (motif.test(texte)) return message;
  return MESSAGE_APPEL_PAR_DEFAUT;
}
