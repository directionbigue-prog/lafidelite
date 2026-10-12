// Le déroulement d'une partie : tenter un mot, passer son tour, connaître
// l'issue.
//
// C'est l'API que consomme l'écran. Comme aux quatre autres jeux du Salon,
// aucune fonction ici ne modifie son entrée.
import {
  autreJoueur,
  motAttendu,
  trouverGrille,
  MOTS_PAR_GRILLE,
  type Emplacement,
  type EtatMotsCroises,
  type Joueur,
} from './etat';

/**
 * Met une proposition sous la forme comparée : espaces superflus retirés,
 * tout en minuscules, accents retirés. Les mots de `grilles.ts` sont déjà
 * sous cette forme — comparer sans normaliser d'abord refuserait « AIMÉR »
 * ou « Aimer » à un joueur qui a pourtant trouvé « aimer ».
 */
function normaliser(saisie: string): string {
  // `NFD` sépare chaque lettre accentuée en lettre nue + marque
  // diacritique combinante ; `\p{M}` (catégorie Unicode « marque ») retire
  // ensuite ces marques, quel que soit l'accent — pas de liste de
  // caractères accentués à tenir à jour au fil des futures grilles.
  return saisie.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/** Vrai si `emplacement` a déjà sa réponse dans `etat`. */
export function estTrouve(etat: EtatMotsCroises, emplacement: Emplacement): boolean {
  return etat.trouves.some(
    (t) => t.direction === emplacement.direction && t.index === emplacement.index,
  );
}

/**
 * Vrai quand la grille est entièrement résolue, ou que les deux joueurs
 * viennent de passer coup sur coup — les deux façons dont une partie de
 * mots croisés s'arrête (voir la spec).
 */
export function partieTerminee(etat: EtatMotsCroises): boolean {
  return etat.passesConsecutifs >= 2 || etat.trouves.length >= MOTS_PAR_GRILLE;
}

export interface ResultatTentative {
  readonly etat: EtatMotsCroises;
  /** Vrai si `proposition` correspondait au mot attendu — pour le message affiché, rien de plus. */
  readonly correct: boolean;
}

/**
 * Le joueur au trait tente `proposition` pour `emplacement`.
 *
 * Juste ou fausse, LA MAIN PASSE toujours — c'est la règle centrale de la
 * spec : l'alternance est stricte, une bonne réponse ne rejoue jamais.
 * Cette fonction ne distingue les deux cas que pour dire si le mot s'inscrit
 * dans la grille ; `trait` change dans les deux branches, sans exception.
 *
 * Refuse — SANS rien modifier — une partie déjà terminée ou un emplacement
 * déjà trouvé : ce sont des invariants du moteur, pas des suggestions pour
 * l'appelant. L'écran doit filtrer en amont (un joueur ne doit jamais
 * pouvoir sélectionner une définition déjà résolue) — un rejet ici est donc
 * un bug de l'appelant, exactement comme pour `choisirMot` au Mot.
 */
export function tenterMot(
  etat: EtatMotsCroises,
  emplacement: Emplacement,
  proposition: string,
): ResultatTentative {
  if (partieTerminee(etat)) {
    throw new Error('La partie est déjà terminée.');
  }
  if (estTrouve(etat, emplacement)) {
    throw new Error('Cette définition a déjà sa réponse.');
  }

  const grille = trouverGrille(etat.idGrille);
  const attendu = motAttendu(grille, emplacement);
  const correct = normaliser(proposition) === normaliser(attendu);

  const trouves = correct
    ? [...etat.trouves, { ...emplacement, trouvePar: etat.trait }]
    : etat.trouves;

  return {
    correct,
    etat: { ...etat, trouves, trait: autreJoueur(etat.trait), passesConsecutifs: 0 },
  };
}

/**
 * Le joueur au trait passe son tour — aucun mot ne s'inscrit, la main
 * change, et le compteur de passages consécutifs avance. Refuse une partie
 * déjà terminée, pour la même raison que `tenterMot`.
 */
export function passerTour(etat: EtatMotsCroises): EtatMotsCroises {
  if (partieTerminee(etat)) {
    throw new Error('La partie est déjà terminée.');
  }
  const passesConsecutifs: 0 | 1 | 2 = etat.passesConsecutifs === 0 ? 1 : 2;
  return { ...etat, trait: autreJoueur(etat.trait), passesConsecutifs };
}

/** Le nombre de mots trouvés par chaque joueur. */
export function score(etat: EtatMotsCroises): Readonly<Record<Joueur, number>> {
  const compte: Record<Joueur, number> = { un: 0, deux: 0 };
  for (const trouve of etat.trouves) {
    compte[trouve.trouvePar] += 1;
  }
  return compte;
}

export type Issue =
  | { readonly fini: false }
  | { readonly fini: true; readonly vainqueur: Joueur | null };

/**
 * L'issue de la partie : celui qui a trouvé le plus de mots l'emporte, à
 * égalité c'est nul — exactement la spec. Non finie tant que
 * `partieTerminee` ne l'est pas.
 */
export function issue(etat: EtatMotsCroises): Issue {
  if (!partieTerminee(etat)) return { fini: false };
  const compte = score(etat);
  if (compte.un === compte.deux) return { fini: true, vainqueur: null };
  return { fini: true, vainqueur: compte.un > compte.deux ? 'un' : 'deux' };
}
