// Les huit thèmes du jeu du couple.
//
// Cette liste est le registre unique : l'écran de sélection la lit, la
// page d'accueil la lit, et le test `themes.test.ts` vérifie que la banque
// de questions la couvre réellement. Elle existe parce que la liste vivait
// auparavant deux fois — en dur dans le canevas de la page d'accueil, et
// nulle part côté jeu — si bien que six des huit thèmes annoncés n'avaient
// aucune question derrière eux et que personne ne s'en apercevait.
//
// Un thème traverse TOUTE la partie : il doit donc exister pour les trois
// types de manche (MIROIR, SCENARIO, FACEAFACE), et avec assez de
// questions pour remplir la plus longue d'entre elles. Voir
// `QUESTIONS_PAR_MANCHE_MAX` ci-dessous : c'est le seuil au-dessus duquel
// un thème est réellement jouable, et en dessous duquel le moteur
// l'ignore sans le dire (`narrowToCategories`).
//
// Pur et utilisable côté client : aucune dépendance Prisma, aucun
// `server-only`.
import { GAME_FORMATS, questionsPerRound } from './formats';

export interface Theme {
  /** Le nom exact, tel qu'il est écrit dans `Question.category`. */
  nom: string;
  /** Une phrase sous le nom, sur la carte de sélection. */
  resume: string;
  /** La teinte de la pastille d'accès, reprise du canevas de design. */
  teinte: string;
}

export const THEMES: readonly Theme[] = [
  {
    nom: 'Confiance & Jalousie',
    resume: 'Ce qu’on tolère, ce qu’on cache, ce qui pique.',
    teinte: '#8B2C56',
  },
  {
    nom: 'Réseaux sociaux & Téléphone',
    resume: 'Les écrans, les notifications, les codes qu’on donne ou pas.',
    teinte: '#8B2C56',
  },
  {
    nom: 'Ex et passé',
    resume: 'Ce qui reste d’avant, et la place qu’on lui laisse.',
    teinte: 'rgba(36,17,41,.68)',
  },
  {
    nom: 'Tentations du quotidien',
    resume: 'Les petites occasions, et où passe la limite.',
    teinte: 'rgba(36,17,41,.68)',
  },
  {
    nom: 'Famille & Belle-famille',
    resume: 'Les vôtres, les siens, et qui tranche.',
    teinte: 'rgba(36,17,41,.68)',
  },
  {
    nom: 'Argent & Transparence',
    resume: 'Qui gagne quoi, qui paie quoi, qui sait quoi.',
    teinte: 'rgba(36,17,41,.68)',
  },
  {
    nom: 'Projets & Engagement',
    resume: 'Le mariage, les enfants, la maison, le calendrier.',
    teinte: '#A9761F',
  },
  {
    nom: 'Mode Piment · 18+',
    resume: 'Le désir, les envies, ce qui ne se dit pas à table.',
    teinte: '#A9761F',
  },
] as const;

/** Les trois types de manche qu'un thème doit couvrir pour être jouable. */
export const TYPES_DE_MANCHE: readonly string[] = ['MIROIR', 'SCENARIO', 'FACEAFACE'];

/** Les noms seuls — ce que `POST /api/games` reçoit dans `categories`. */
export const NOMS_THEMES: readonly string[] = THEMES.map((t) => t.nom);

/**
 * Le plus grand nombre de questions qu'une manche puisse tirer, tous
 * formats confondus (Longue soirée : 30 questions, soit 10/10/10).
 *
 * Calculé plutôt que recopié : le jour où un quatrième format arrive, le
 * seuil du test suit tout seul. Une constante écrite à la main ici serait
 * la quatrième copie d'un nombre que `formats.ts` possède déjà — et
 * `state-machine.ts` documente exactement ce défaut, trois copies de « 5 »
 * ayant déjà divergé dans ce dépôt.
 */
export const QUESTIONS_PAR_MANCHE_MAX: number = Math.max(
  ...GAME_FORMATS.flatMap((f) => questionsPerRound(f.totalQuestions, TYPES_DE_MANCHE.length)),
);

export function themeParNom(nom: string): Theme | null {
  return THEMES.find((t) => t.nom === nom) ?? null;
}

/**
 * Filtre une sélection reçue d'un client aux thèmes que l'on connaît.
 *
 * Échoue en silence plutôt qu'en erreur, volontairement : un nom inconnu
 * ne correspond à aucune question, donc le laisser passer ne « débloque »
 * rien — il rend seulement la sélection intenable et fait élargir la
 * manche au pool complet. Le retirer produit le même jeu, en plus lisible.
 */
export function filtrerThemesConnus(noms: readonly string[]): string[] {
  const connus = new Set(NOMS_THEMES);
  return [...new Set(noms)].filter((n) => connus.has(n));
}

/**
 * Coche ou décoche un thème, en conservant l'ordre du registre.
 *
 * L'ordre importe : le tirage reçoit la liste telle quelle, et deux
 * sélections identiques cliquées dans un ordre différent doivent produire
 * le même corps de requête — sans quoi deux parties « identiques »
 * donneraient des caches et des journaux différents pour rien.
 */
export function basculerTheme(selection: readonly string[], nom: string): string[] {
  const set = new Set(selection);
  if (set.has(nom)) {
    set.delete(nom);
  } else {
    set.add(nom);
  }
  return NOMS_THEMES.filter((n) => set.has(n));
}

/**
 * Le corps de `POST /api/games`.
 *
 * Une sélection VIDE n'envoie pas `categories`, et n'envoie surtout pas un
 * tableau vide : « aucun thème » veut dire « toute la banque », ce qui
 * inclut le fonds général hors des huit thèmes. Le champ est optionnel
 * côté route précisément pour cette raison.
 */
export function corpsDeCreation(
  format: string,
  selection: readonly string[],
): { format: string; categories?: string[] } {
  const themes = filtrerThemesConnus(selection);
  return themes.length > 0 ? { format, categories: themes } : { format };
}
