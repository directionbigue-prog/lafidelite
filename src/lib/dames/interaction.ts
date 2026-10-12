// Ce qui se passe quand on touche une case.
//
// Une fonction pure plutôt qu'un `useState` dans la page : la sélection
// est plus subtile qu'elle n'en a l'air — surtout dans une rafle à
// plusieurs sauts — et une fonction pure se teste, un état de composant
// non (le dépôt ne monte pas de composants).
import { coupsLegaux } from './coups';
import { type Coup, type EtatPlateau, pieceEn } from './etat';

export interface Interaction {
  readonly selection: number | null;
  /**
   * Les cases d'atterrissage déjà franchies dans la rafle en cours. Vide
   * hors rafle. C'est ce qui permet de ne proposer, après chaque saut, que
   * les continuations de CETTE séquence.
   */
  readonly parcours: readonly number[];
}

export const INTERACTION_VIDE: Interaction = { selection: null, parcours: [] };

export type Reaction =
  | { readonly type: 'selection'; readonly interaction: Interaction }
  | { readonly type: 'coup'; readonly coup: Coup }
  | { readonly type: 'rafle'; readonly interaction: Interaction }
  | { readonly type: 'refus'; readonly message: string }
  | { readonly type: 'rien' };

/** Les coups encore compatibles avec la rafle en cours. */
function candidats(etat: EtatPlateau, interaction: Interaction): Coup[] {
  const tous = coupsLegaux(etat);
  if (interaction.selection === null) return tous;
  return tous.filter((coup) => {
    if (coup.depart !== interaction.selection) return false;
    // Le parcours déjà accompli doit être un préfixe des paliers du coup.
    // C'est ce filtre qui empêche de changer de rafle en cours de route.
    return interaction.parcours.every((palier, i) => coup.paliers[i] === palier);
  });
}

/** Les cases sur lesquelles le joueur peut cliquer maintenant. */
export function jouables(etat: EtatPlateau, interaction: Interaction): number[] {
  if (interaction.selection !== null) return [interaction.selection];
  return [...new Set(coupsLegaux(etat).map((coup) => coup.depart))];
}

/** Les destinations proposées pour la sélection courante. */
export function destinations(etat: EtatPlateau, interaction: Interaction): number[] {
  if (interaction.selection === null) return [];
  const franchis = interaction.parcours.length;
  return [
    ...new Set(
      candidats(etat, interaction).map((coup) =>
        // Dans une rafle en cours, la prochaine case cliquable est le
        // palier suivant — pas l'arrivée finale.
        franchis < coup.paliers.length ? (coup.paliers[franchis] ?? coup.arrivee) : coup.arrivee,
      ),
    ),
  ];
}

export function toucher(etat: EtatPlateau, interaction: Interaction, caseNum: number): Reaction {
  // Une destination proposée : on conclut le coup, ou on avance d'un
  // palier dans la rafle.
  if (interaction.selection !== null && destinations(etat, interaction).includes(caseNum)) {
    const franchis = interaction.parcours.length;

    // Les candidats sont calculés sur l'interaction AVANT ce toucher : un
    // coup qui s'achève ici n'a pas de palier à la position `franchis`, et
    // l'ajouter au parcours l'exclurait du filtre — le coup ne serait
    // jamais reconnu comme terminé, et la rafle tournerait en rond.
    const acheve = candidats(etat, interaction).find(
      (coup) => coup.arrivee === caseNum && coup.paliers.length === franchis,
    );
    if (acheve !== undefined) return { type: 'coup', coup: acheve };

    return {
      type: 'rafle',
      interaction: {
        selection: interaction.selection,
        parcours: [...interaction.parcours, caseNum],
      },
    };
  }

  // Retoucher la pièce sélectionnée annule — sauf en pleine rafle, où
  // revenir en arrière donnerait un plateau déjà à moitié joué.
  if (interaction.selection === caseNum && interaction.parcours.length === 0) {
    return { type: 'selection', interaction: INTERACTION_VIDE };
  }
  if (interaction.parcours.length > 0) return { type: 'rien' };

  const piece = pieceEn(etat.cases, caseNum);
  if (piece === null || piece.camp !== etat.trait) return { type: 'rien' };

  const legaux = coupsLegaux(etat);
  if (legaux.some((coup) => coup.depart === caseNum)) {
    return { type: 'selection', interaction: { selection: caseNum, parcours: [] } };
  }

  // La pièce appartient bien au joueur, mais elle n'a aucun coup. Si des
  // prises existent ailleurs, c'est la règle de la prise obligatoire qui
  // la bloque — et c'est la règle qui surprend le plus. Un plateau muet
  // ressemblerait à un bug.
  if (legaux.some((coup) => coup.captures.length > 0)) {
    return { type: 'refus', message: 'La prise est obligatoire : une autre pièce doit prendre.' };
  }
  return { type: 'rien' };
}
