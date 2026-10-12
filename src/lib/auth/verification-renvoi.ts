// Ce qu'on dit à quelqu'un qui a cliqué « renvoyer le code » et n'a rien reçu.
//
// Le problème que ce module règle n'est pas une panne d'envoi. Le 02/10/2026,
// un compte est resté bloqué sur /verify-email à redemander un code : il était
// DÉJÀ vérifié, à 11:28:58, dix-sept secondes après avoir reçu le précédent.
// `POST /api/auth/resend-verification` ne renvoie un code que si une
// vérification est en attente — donc il ne se passait rien, encore et encore,
// et l'écran répondait à chaque fois la même phrase rassurante.
//
// La phrase était pourtant exacte : « SI une vérification est en attente ».
// C'est une tournure volontairement évasive, et elle doit le rester — la route
// refuse de distinguer « adresse inconnue », « déjà vérifiée » et « en
// attente », parce que les distinguer dirait à n'importe qui si un compte
// existe. L'invariant est dans CLAUDE.md et il n'est pas négociable.
//
// Ce qu'on peut faire sans rien révéler : donner les trois raisons possibles
// d'un silence, pour que le lecteur reconnaisse la sienne. Dire « les comptes
// déjà vérifiés ne reçoivent rien, connectez-vous directement » ne confirme
// RIEN sur cette adresse-là ; c'est une règle générale, vraie pour tout le
// monde, et elle suffit à débloquer quelqu'un qui tourne en rond.

/**
 * La confirmation après un renvoi.
 *
 * Reste au conditionnel. Un test interdit les tournures qui affirmeraient
 * quoi que ce soit sur l'adresse saisie.
 */
export const MESSAGE_RENVOI =
  'Si une vérification est en attente pour cette adresse, un nouveau code vient d’être envoyé.';

/**
 * Les trois raisons d'un silence, dans l'ordre où elles se vérifient :
 * la plus fréquente d'abord, la moins devinable ensuite.
 */
export const PISTES_SI_RIEN_NE_VIENT: readonly string[] = [
  'Regardez dans les indésirables et dans l’onglet Promotions : le message part bien, mais certains fournisseurs le classent ailleurs.',
  'Un compte déjà vérifié ne reçoit aucun code — c’est normal, et il n’y a rien à attendre. Allez directement à la connexion.',
  'Un code n’est valable que quelques minutes. Passé ce délai, redemandez-en un plutôt que de ressaisir l’ancien.',
] as const;

/**
 * Des tournures qui trahiraient l'existence — ou l'état — du compte visé.
 *
 * Exportées pour que le test les lise au lieu de les redire : une liste de
 * garde recopiée dans son propre test ne garde plus rien.
 */
export const TOURNURES_INTERDITES: readonly string[] = [
  'cette adresse est déjà vérifiée',
  'ce compte est déjà vérifié',
  'votre compte est déjà vérifié',
  'adresse inconnue',
  'aucun compte',
  'ce compte n’existe pas',
  'ce compte existe',
] as const;
