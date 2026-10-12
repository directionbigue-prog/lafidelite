// Le marquage d'une tentative contre le mot à deviner.
//
// C'est le seul endroit de ce moteur qui mérite de la méfiance — voir la
// spec, « La règle qui piège toutes les implémentations ». Le piège tient
// aux LETTRES RÉPÉTÉES : si le mot est `ARBRE` et la tentative `RRRRR`,
// seuls DEUX `R` doivent être marqués (il n'y en a que deux dans le mot),
// pas cinq. Une implémentation en une seule passe — marquer chaque lettre
// « présente » dès qu'elle figure quelque part dans le mot, sans jamais
// décompter — marque les trois `R` en trop et ment au joueur.
//
// L'algorithme correct se fait en DEUX passes, dans cet ordre et pas
// l'autre :
//
//   1. D'abord, toutes les lettres BIEN PLACÉES, chacune retirée aussitôt
//      du compte des lettres encore disponibles dans le mot.
//   2. Ensuite seulement, les lettres restantes : une lettre est marquée
//      PRÉSENTE AILLEURS si et seulement s'il reste au moins une
//      occurrence non consommée de cette lettre dans ce compte.
//
// Faire les deux passes en une seule (marquer « présente » à la volée
// pendant qu'on cherche les bien-placées) donnerait un résultat qui dépend
// de l'ordre des lettres dans la tentative — précisément le bug que cette
// séparation en deux passes existe pour empêcher.
import { LONGUEUR_MOT } from './etat';

export type StatutLettre = 'bien-place' | 'present' | 'absent';

export interface LettreMarquee {
  readonly lettre: string;
  readonly statut: StatutLettre;
}

/**
 * Marque chaque lettre de `tentative` par rapport à `mot`. Les deux
 * doivent compter `LONGUEUR_MOT` lettres ; ni l'un ni l'autre n'a besoin
 * d'être un mot du dictionnaire ici — cette fonction ne fait QUE comparer
 * deux chaînes lettre à lettre, la légalité de la tentative est
 * l'affaire de `partie.ts`.
 */
export function marquerTentative(mot: string, tentative: string): readonly LettreMarquee[] {
  if (mot.length !== LONGUEUR_MOT || tentative.length !== LONGUEUR_MOT) {
    throw new Error(`Le mot et la tentative doivent compter ${LONGUEUR_MOT} lettres.`);
  }

  // Le compte des lettres du mot encore disponibles pour un marquage
  // « présente ailleurs » — décompté au fil des deux passes ci-dessous.
  const disponibles = new Map<string, number>();
  for (const lettre of mot) {
    disponibles.set(lettre, (disponibles.get(lettre) ?? 0) + 1);
  }

  const statuts: StatutLettre[] = new Array(LONGUEUR_MOT).fill('absent') as StatutLettre[];

  // Passe 1 — bien placées, retirées aussitôt du compte disponible.
  for (let i = 0; i < LONGUEUR_MOT; i += 1) {
    const lettre = tentative.charAt(i);
    if (lettre === mot.charAt(i)) {
      statuts[i] = 'bien-place';
      disponibles.set(lettre, (disponibles.get(lettre) ?? 0) - 1);
    }
  }

  // Passe 2 — présentes ailleurs, seulement s'il reste une occurrence non
  // consommée par la première passe. Une lettre déjà marquée bien placée
  // à cet index n'est jamais réexaminée ici.
  for (let i = 0; i < LONGUEUR_MOT; i += 1) {
    if (statuts[i] === 'bien-place') continue;
    const lettre = tentative.charAt(i);
    const restantes = disponibles.get(lettre) ?? 0;
    if (restantes > 0) {
      statuts[i] = 'present';
      disponibles.set(lettre, restantes - 1);
    }
  }

  return Array.from({ length: LONGUEUR_MOT }, (_, i) => ({
    lettre: tentative.charAt(i),
    statut: statuts[i] ?? 'absent',
  }));
}
