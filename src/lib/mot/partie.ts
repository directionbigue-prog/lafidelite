// Le déroulement d'une partie : choisir le mot, tenter une réponse, passer
// à la manche suivante, connaître l'issue.
//
// C'est l'API que consomme l'écran. Comme aux trois autres jeux du Salon,
// aucune fonction ici ne modifie son entrée.
import { estUnMotDuDictionnaire, normaliserMot } from './dictionnaire';
import {
  TENTATIVES_MAX,
  mancheActuelle,
  premiereManche,
  type EtatMot,
  type Joueur,
  type Manche,
} from './etat';

/** Vrai quand la manche a un mot trouvé, ou a épuisé ses six tentatives. */
export function mancheTerminee(manche: Manche): boolean {
  if (manche.mot === null) return false;
  if (manche.tentatives.includes(manche.mot)) return true;
  return manche.tentatives.length >= TENTATIVES_MAX;
}

/**
 * Le nombre de tentatives qu'il a fallu à `devineur` pour trouver le mot
 * de cette manche — `null` si le mot n'a pas (encore) été trouvé, que la
 * manche soit terminée ou non.
 */
export function tentativesPourTrouver(manche: Manche): number | null {
  if (manche.mot === null) return null;
  const index = manche.tentatives.indexOf(manche.mot);
  return index === -1 ? null : index + 1;
}

function remplacerMancheActuelle(etat: EtatMot, manche: Manche): EtatMot {
  const manches = [...etat.manches];
  manches[manches.length - 1] = manche;
  return { manches };
}

/**
 * Le proposeur choisit le mot de la manche courante.
 *
 * Ne vérifie que « la manche n'a pas déjà un mot » et que `mot` est bien
 * un mot du dictionnaire : les deux sont des invariants du MOTEUR, pas des
 * suggestions pour l'appelant. L'écran, lui, doit filtrer en amont avec
 * `validerSaisie` pour donner un message utile AVANT d'appeler cette
 * fonction — exactement comme `coupsLegaux` filtre en amont d'`appliquer`
 * à l'Awalé. Un rejet ici est donc un bug de l'appelant, pas un cas que
 * cette fonction doit deviner en silence.
 */
export function choisirMot(etat: EtatMot, mot: string): EtatMot {
  const manche = mancheActuelle(etat);
  if (manche.mot !== null) {
    throw new Error('Le mot de cette manche est déjà choisi.');
  }
  const motNormalise = normaliserMot(mot);
  if (!estUnMotDuDictionnaire(motNormalise)) {
    throw new Error(`« ${mot} » n'est pas un mot du dictionnaire.`);
  }
  return remplacerMancheActuelle(etat, { ...manche, mot: motNormalise });
}

/**
 * Le devineur tente `mot`.
 *
 * Refuse — SANS modifier `etat` — une manche sans mot choisi, une manche
 * déjà terminée, ou une tentative hors dictionnaire : c'est la règle
 * centrale de la spec, « une tentative refusée ne consomme pas d'essai ».
 * Contrairement à `choisirMot`, la vérification dictionnaire n'est pas ici
 * un simple filet de sécurité redondant avec l'écran : elle fait partie du
 * contrat de cette fonction, parce que « refuser sans consommer » est
 * exactement ce qu'une exception AVANT toute modification de `tentatives`
 * accomplit — l'appelant n'a rien à défaire.
 */
export function tenterMot(etat: EtatMot, mot: string): EtatMot {
  const manche = mancheActuelle(etat);
  if (manche.mot === null) {
    throw new Error('Aucun mot n’a encore été choisi pour cette manche.');
  }
  if (mancheTerminee(manche)) {
    throw new Error('Cette manche est déjà terminée.');
  }
  const motNormalise = normaliserMot(mot);
  if (!estUnMotDuDictionnaire(motNormalise)) {
    throw new Error(`« ${mot} » n'est pas un mot du dictionnaire.`);
  }
  return remplacerMancheActuelle(etat, {
    ...manche,
    tentatives: [...manche.tentatives, motNormalise],
  });
}

/**
 * Ouvre la seconde manche, rôles échangés — le devineur de la première
 * devient le proposeur de la seconde, et réciproquement.
 *
 * Refuse une première manche non terminée, et refuse d'ouvrir une
 * TROISIÈME manche : ce second refus est ce qui tient l'invariant « au
 * plus deux manches » que `EtatMot` ne porte pas dans son type (voir la
 * note de `etat.ts`) — sans lui, un appel de trop construirait un état
 * que `issue` ne saurait plus interpréter.
 */
export function passerManche(etat: EtatMot): EtatMot {
  if (etat.manches.length >= 2) {
    throw new Error('La partie a déjà ses deux manches.');
  }
  const premiere = premiereManche(etat);
  if (!mancheTerminee(premiere)) {
    throw new Error('La première manche n’est pas terminée.');
  }
  const seconde: Manche = {
    proposeur: premiere.devineur,
    devineur: premiere.proposeur,
    mot: null,
    tentatives: [],
  };
  return { manches: [premiere, seconde] };
}

export type Issue =
  | { readonly fini: false }
  | { readonly fini: true; readonly vainqueur: Joueur | null };

/**
 * L'issue de la partie.
 *
 * Non finie tant que la seconde manche n'existe pas, ou existe sans être
 * terminée — une seule manche jouée ne dit rien du vainqueur, même si son
 * devineur a trouvé le mot au premier essai : il reste à savoir ce que
 * l'autre fera de sa propre manche.
 *
 * Le vainqueur est celui des deux devineurs qui a trouvé SON mot en moins
 * de tentatives. Ne pas trouver compte comme « pire que n'importe quel
 * nombre de tentatives » : un devineur qui trouve bat toujours un devineur
 * qui ne trouve pas, même en six tentatives contre une seule ratée. À
 * égalité de tentatives — ou si aucun des deux n'a trouvé — la partie est
 * nulle. C'est exactement la spec.
 */
export function issue(etat: EtatMot): Issue {
  if (etat.manches.length < 2) return { fini: false };
  const premiere = premiereManche(etat);
  const seconde = mancheActuelle(etat);
  if (!mancheTerminee(seconde)) return { fini: false };

  const tentativesPremiere = tentativesPourTrouver(premiere);
  const tentativesSeconde = tentativesPourTrouver(seconde);

  if (tentativesPremiere === null && tentativesSeconde === null) {
    return { fini: true, vainqueur: null };
  }
  if (tentativesPremiere === null) {
    return { fini: true, vainqueur: seconde.devineur };
  }
  if (tentativesSeconde === null) {
    return { fini: true, vainqueur: premiere.devineur };
  }
  if (tentativesPremiere === tentativesSeconde) {
    return { fini: true, vainqueur: null };
  }
  return {
    fini: true,
    vainqueur: tentativesPremiere < tentativesSeconde ? premiere.devineur : seconde.devineur,
  };
}
