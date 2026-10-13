// Le nom qu'un écran du Salon donne au second joueur.
//
// Avec un couple ACTIF, c'est le prénom du partenaire. Sans couple actif —
// le Salon s'est ouvert aux comptes seuls le 13/10/2026 — le second joueur
// est quelqu'un assis à côté, sans compte : « Votre partenaire » le
// désignerait à tort. Un couple encore PENDING compte comme seul, puisque
// personne ne l'a rejoint.
//
// Le nom s'insère tel quel dans des phrases (« À Joueur 2 de jouer. »,
// « Passe l'appareil à Joueur 2 »), d'où une étiquette qui se lit comme un
// prénom plutôt qu'un groupe nominal.

export interface CoupleMeResponse {
  couple: { status?: string; partnerName?: string | null } | null;
}

export const SECOND_JOUEUR_SANS_COUPLE = 'Joueur 2';
export const SECOND_JOUEUR_SANS_PRENOM = 'Votre partenaire';

export function nomDuSecondJoueur(reponse: CoupleMeResponse): string {
  const couple = reponse.couple;
  if (couple?.status !== 'ACTIVE') return SECOND_JOUEUR_SANS_COUPLE;
  return couple.partnerName || SECOND_JOUEUR_SANS_PRENOM;
}
