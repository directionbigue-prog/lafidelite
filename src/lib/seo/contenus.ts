// Ce que montrent les pages de contenu — /jeu-de-couple-a-distance,
// /questions-pour-couple, /jeux-a-deux — écrites pour être trouvées sur ces
// recherches précises (16/10/2026).
//
// Tout ce qui peut dériver est lu des registres : les énoncés dans la banque
// de questions, les comptes par thème dans la même banque, les jeux et leur
// but dans le registre du Salon. Une page de référencement qui promet un
// contenu que le jeu ne contient pas se paie à la première partie.
//
// Importé uniquement par des composants SERVEUR : la banque de questions ne
// doit entrer dans aucun bundle client (`categories.test.ts`).

import { QUESTIONS_SEED } from '../../../prisma/seed-data/questions';
import { THEMES } from '@/lib/game/themes';
import { roundLabelForType, type RoundType } from '@/lib/game/round-labels';
import { JEUX, type Jeu } from '@/lib/salon/jeux';
import { NOMS_DES_JEUX } from '@/lib/salon/noms';
import { REGLES } from '@/lib/salon/regles';

/** Les pages de contenu, et le libellé de leur lien. */
export const PAGES_DE_CONTENU: readonly { chemin: string; lien: string }[] = [
  { chemin: '/jeu-de-couple-a-distance', lien: 'Jeu de couple à distance' },
  { chemin: '/questions-pour-couple', lien: 'Questions pour couple' },
  { chemin: '/jeux-a-deux', lien: 'Jeux à deux' },
];

/**
 * Quatre questions par manche, choisies par slug, hors Mode Piment.
 *
 * Par slug et non par position : la banque grandit, et un « les quatre
 * premières » changerait d'exemples à chaque ajout. Une question retirée fait
 * rougir `contenus.test.ts` au lieu de disparaître de la page.
 */
export const EXEMPLES_DE_QUESTIONS: Readonly<Record<RoundType, readonly string[]>> = {
  MIROIR: [
    'mirror-plat-prefere',
    'rs-m07-story-du-couple',
    'ar-m07-compte-commun',
    'pe-m05-engagement-signe',
  ],
  SCENARIO: [
    'cj-s01-ex-au-restaurant',
    'fa-s01-remarque-belle-mere',
    'ar-s07-budget-depasse',
    'rs-s07-statut-relationnel',
  ],
  FACEAFACE: [
    'cj-f01-fondement-confiance',
    'fa-f01-place-de-la-famille',
    'ar-f07-argent-et-pouvoir',
    'pe-f05-projets-separes',
  ],
};

export interface MancheEnExemple {
  type: RoundType;
  titre: string;
  regle: string;
  /** Les énoncés seuls : ni les choix, ni leur poids, qui font le jeu. */
  questions: string[];
}

export function echantillonParManche(): MancheEnExemple[] {
  const parSlug = new Map(QUESTIONS_SEED.map((q) => [q.slug, q.prompt]));
  return (Object.keys(EXEMPLES_DE_QUESTIONS) as RoundType[]).map((type) => {
    const libelle = roundLabelForType(type);
    return {
      type,
      titre: libelle?.title ?? type,
      regle: libelle?.rule ?? '',
      questions: EXEMPLES_DE_QUESTIONS[type].flatMap((slug) => {
        const enonce = parSlug.get(slug);
        return enonce ? [enonce] : [];
      }),
    };
  });
}

export function themesAvecCompte(): { nom: string; resume: string; questions: number }[] {
  return THEMES.map((theme) => ({
    nom: theme.nom,
    resume: theme.resume,
    questions: QUESTIONS_SEED.filter((q) => q.category === theme.nom).length,
  }));
}

export function jeuxDuSalon(): { kind: Jeu; nom: string; but: string }[] {
  return JEUX.map((kind) => ({ kind, nom: NOMS_DES_JEUX[kind], but: REGLES[kind].but }));
}
