// Le compte du partenaire invité : créé d'un clic depuis le lien
// d'invitation, sans email ni mot de passe.
//
// Seul celui qui invite passe par l'inscription. L'invité donne son prénom,
// et la session est ouverte sur-le-champ — c'est tout l'intérêt du lien.
//
// `User.email` est obligatoire et unique, donc le compte reçoit une adresse
// de remplacement dans le domaine `.invalid` (RFC 2606 : réservé, ne résout
// jamais). Elle n'est pas une adresse : aucun mail ne doit lui être envoyé,
// et la file d'emails la refuse via `estAdresseInvite` — sinon chaque rappel
// du rituel finirait en rebond chez Resend et abîmerait la réputation du
// domaine d'envoi.
//
// Module pur et isomorphe : la page d'invitation et la file d'emails le lisent.

export const DOMAINE_INVITE = 'invite.coeurfidele.invalid';

export function adresseInvite(identifiant: string): string {
  return `partenaire-${identifiant}@${DOMAINE_INVITE}`;
}

export function estAdresseInvite(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${DOMAINE_INVITE}`);
}
