// L'état d'une partie du Mot, et rien d'autre.
//
// Comme pour les dames, l'Awalé et le Ludo : aucune dépendance à Prisma,
// React ou au DOM. Le même module tourne dans le navigateur pendant la
// partie, dans Vitest pour les invariants, et un jour côté serveur, sans
// une ligne à changer.
//
// Contrairement aux trois autres jeux du Salon, il n'y a pas de plateau
// ici : une partie du Mot est une SUITE D'AU PLUS DEUX MANCHES, chacune
// formée d'un mot à deviner et des tentatives déjà faites contre lui.
// « Le trait », au sens où les dames et l'Awalé l'entendent (qui joue
// maintenant), n'a donc pas d'équivalent unique — chaque manche a son
// PROPOSEUR (qui choisit le mot) et son DEVINEUR (qui tente de le
// trouver), et ces deux rôles s'échangent d'une manche à l'autre. C'est
// pour cette raison que ce fichier ne porte pas de champ `trait` : il se
// déduit sans ambiguïté de la manche courante (`proposeur`/`devineur`) et
// du fait qu'un mot a ou non déjà été choisi — un champ redondant ne
// ferait que courir le risque de diverger de ce que la manche dit déjà.
export type Joueur = 'un' | 'deux';

/** La longueur, fixe, des mots de ce lot — voir la spec, « Hors périmètre ». */
export const LONGUEUR_MOT = 5;

/** Six tentatives par manche, comme au jeu de référence. */
export const TENTATIVES_MAX = 6;

export function autreJoueur(joueur: Joueur): Joueur {
  return joueur === 'un' ? 'deux' : 'un';
}

export interface Manche {
  readonly proposeur: Joueur;
  readonly devineur: Joueur;
  /** `null` tant que `proposeur` n'a pas encore choisi de mot. */
  readonly mot: string | null;
  /** Les tentatives déjà validées contre le dictionnaire, dans l'ordre. */
  readonly tentatives: readonly string[];
}

/**
 * L'état complet : une manche, puis deux — jamais plus, jamais moins.
 *
 * Un tableau plutôt qu'un tuple `[Manche] | [Manche, Manche]` : ce dépôt
 * active `noUncheckedIndexedAccess`, et un tuple en union aurait forcé
 * `mancheActuelle`/`premiereManche` à re-décider ce choix à chaque appel.
 * L'invariant « une à deux manches » est donc porté par la FORME
 * (`etat-schema.ts`, `.min(1).max(2)`) et par les fonctions de
 * `partie.ts` qui construisent l'état — exactement comme les douze trous
 * de l'Awalé sont un `readonly number[]` et pas un tuple de douze
 * éléments.
 */
export interface EtatMot {
  readonly manches: readonly Manche[];
}

/**
 * La manche en cours — toujours la dernière du tableau. Lève si `manches`
 * est vide : cela ne devrait jamais arriver (voir `positionDepart` et
 * `etat-schema.ts`, qui exige au moins une manche), donc un appel qui
 * déclenche cette erreur signale un état construit à la main plutôt que
 * par ce module — un bug de l'appelant, pas un cas à deviner.
 */
export function mancheActuelle(etat: EtatMot): Manche {
  const derniere = etat.manches[etat.manches.length - 1];
  if (derniere === undefined) {
    throw new Error('Une partie du Mot doit toujours avoir au moins une manche.');
  }
  return derniere;
}

/** La première manche — même garde que `mancheActuelle`, pour la même raison. */
export function premiereManche(etat: EtatMot): Manche {
  const premiere = etat.manches[0];
  if (premiere === undefined) {
    throw new Error('Une partie du Mot doit toujours avoir au moins une manche.');
  }
  return premiere;
}

/**
 * La position de départ : une seule manche, sans mot choisi, où « un »
 * propose et « deux » devine — exactement comme `sud` ouvre toujours
 * l'Awalé. C'est la personne qui lance la partie (donc qui tient déjà
 * l'appareil) qui propose en premier : aucun passage d'appareil n'est
 * nécessaire avant le tout premier mot.
 */
export function positionDepart(): EtatMot {
  return {
    manches: [{ proposeur: 'un', devineur: 'deux', mot: null, tentatives: [] }],
  };
}
