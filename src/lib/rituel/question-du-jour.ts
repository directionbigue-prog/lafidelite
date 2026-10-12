// La question du jour — ce qui se dévoile, et quand.
//
// Pur, pour être testé sans base : la route charge les lignes, ce module
// décide de ce qui sort. Deux règles, les mêmes que dans le jeu
// (`game/response-shaping.ts`) :
//
//   1. La réponse d'un partenaire n'est JAMAIS visible tant que l'autre n'a
//      pas répondu à son tour — sinon le second recopie le premier, et
//      « deviner l'autre » ne veut plus rien dire.
//   2. Une option ne sort qu'avec `id` et `text`. Les questions MIROIR n'ont
//      pas de poids, mais une option inattendue de la banque ne doit pas
//      fuir pour autant : on reconstruit, on ne filtre pas.

export const ROLES = ['CREATOR', 'PARTNER'] as const;
export type Role = (typeof ROLES)[number];

export function estUnRole(valeur: unknown): valeur is Role {
  return valeur === 'CREATOR' || valeur === 'PARTNER';
}

export interface Option {
  id: string;
  text: string;
}

/** Les options d'une question, réduites à ce qu'un écran peut voir. */
export function optionsPubliques(brut: unknown): Option[] {
  if (!Array.isArray(brut)) return [];
  const sortie: Option[] = [];
  for (const o of brut) {
    if (o && typeof o === 'object' && typeof o.id === 'string' && typeof o.text === 'string') {
      sortie.push({ id: o.id, text: o.text });
    }
  }
  return sortie;
}

export interface LigneReponse {
  role: string;
  choixPropre: string;
  choixDevine: string;
}

export interface ReponseRevelee {
  propre: string;
  devine: string;
  /** Ce rôle a deviné la réponse de l'autre. */
  devineJuste: boolean;
}

export interface Revelation {
  aRepondu: Record<Role, boolean>;
  /** `null` tant que les deux n'ont pas répondu. */
  revele: (Record<Role, ReponseRevelee> & { telepathie: boolean }) | null;
}

function autre(role: Role): Role {
  return role === 'CREATOR' ? 'PARTNER' : 'CREATOR';
}

export function revelation(lignes: readonly LigneReponse[]): Revelation {
  const parRole = new Map<Role, LigneReponse>();
  for (const l of lignes) if (estUnRole(l.role)) parRole.set(l.role, l);

  const aRepondu = { CREATOR: parRole.has('CREATOR'), PARTNER: parRole.has('PARTNER') };
  const c = parRole.get('CREATOR');
  const p = parRole.get('PARTNER');
  if (!c || !p) return { aRepondu, revele: null };

  const lignesParRole: Record<Role, LigneReponse> = { CREATOR: c, PARTNER: p };
  const reveler = (role: Role): ReponseRevelee => ({
    propre: lignesParRole[role].choixPropre,
    devine: lignesParRole[role].choixDevine,
    devineJuste: lignesParRole[role].choixDevine === lignesParRole[autre(role)].choixPropre,
  });
  const CREATOR = reveler('CREATOR');
  const PARTNER = reveler('PARTNER');
  return {
    aRepondu,
    revele: { CREATOR, PARTNER, telepathie: CREATOR.devineJuste && PARTNER.devineJuste },
  };
}

/** Un choix est recevable s'il désigne une option réelle de la question. */
export function choixValide(options: readonly Option[], choix: unknown): choix is string {
  return typeof choix === 'string' && options.some((o) => o.id === choix);
}
