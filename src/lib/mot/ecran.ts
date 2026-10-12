// La phase d'écran à afficher, dérivée de l'état de la partie et d'un seul
// indicateur local à l'interface.
//
// Pure exprès, comme le reste du moteur : aucune fonction ici ne touche au
// DOM ni à React. Ce dépôt n'a ni jsdom ni Testing Library (voir
// CLAUDE.md), donc la logique de décision — quel écran montrer, à quel
// moment demander le passage de l'appareil — se teste ici, par de vrais
// appels de fonction, plutôt que d'être enfouie dans page.tsx où seule une
// lecture du texte source pourrait l'atteindre.
import { mancheActuelle, type EtatMot, type Manche } from './etat';
import { mancheTerminee } from './partie';

/** Une manche dont le mot est garanti choisi — voir `phaseEcran` ci-dessous. */
export interface MancheAvecMot extends Manche {
  readonly mot: string;
}

export type PhaseEcran =
  | { readonly kind: 'choix-mot'; readonly manche: Manche }
  | { readonly kind: 'attente-passage'; readonly manche: MancheAvecMot }
  | { readonly kind: 'deviner'; readonly manche: MancheAvecMot }
  | { readonly kind: 'fin-manche'; readonly manche: MancheAvecMot }
  | { readonly kind: 'fin-partie' };

/**
 * `appareilConfirme` : vrai une fois que le devineur de la manche EN COURS
 * a confirmé avoir reçu l'appareil. Ce n'est pas un champ de `EtatMot` —
 * voir `appareilConfirmeInitial` ci-dessous pour pourquoi cet indicateur
 * reste délibérément hors de l'état persisté.
 *
 * L'ordre des vérifications compte : une manche terminée doit rester
 * « fin-manche » même si on lui passait encore `appareilConfirme: false`
 * par erreur, donc la fin de manche est tranchée AVANT le passage.
 */
export function phaseEcran(etat: EtatMot, appareilConfirme: boolean): PhaseEcran {
  const manche = mancheActuelle(etat);

  if (mancheTerminee(manche)) {
    const { mot } = manche;
    if (mot === null) {
      // Invariant de `partie.ts` : `mancheTerminee` ne peut être vraie que
      // pour une manche dont le mot a déjà été choisi. Un état qui viole
      // cette invariante est corrompu au-delà de ce qu'un écran peut
      // afficher — throw plutôt que deviner un mot qui n'existe pas.
      throw new Error('Manche terminée sans mot choisi — état incohérent.');
    }
    const mancheAvecMot: MancheAvecMot = { ...manche, mot };
    return etat.manches.length >= 2
      ? { kind: 'fin-partie' }
      : { kind: 'fin-manche', manche: mancheAvecMot };
  }

  if (manche.mot === null) {
    return { kind: 'choix-mot', manche };
  }

  const { mot } = manche;
  const mancheAvecMot: MancheAvecMot = { ...manche, mot };
  return appareilConfirme
    ? { kind: 'deviner', manche: mancheAvecMot }
    : { kind: 'attente-passage', manche: mancheAvecMot };
}

/**
 * Le point de départ de `appareilConfirme` au chargement d'une partie.
 *
 * Cet indicateur est PUREMENT local à l'écran : rien côté serveur ne dit
 * si l'écran de passage a déjà été validé, parce que ce n'est pas une
 * information de partie, c'est une étape d'interface — la persister
 * forcerait une sauvegarde réseau pour un simple clic de confirmation.
 *
 * Au rechargement, la seule trace indirecte qu'il en reste est qu'une
 * tentative a déjà été enregistrée : cela prouve que le devineur a bien
 * reçu l'appareil un jour. Sans tentative, le plus sûr est de remontrer
 * l'écran de passage — au pire il faut confirmer une seconde fois, jamais
 * deviner à l'aveugle qui tient l'appareil.
 */
export function appareilConfirmeInitial(etat: EtatMot): boolean {
  return mancheActuelle(etat).tentatives.length > 0;
}
