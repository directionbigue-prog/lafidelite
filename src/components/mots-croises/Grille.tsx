'use client';

// La grille de mots croisés, et rien d'autre.
//
// Composant d'affichage pur : il reçoit les cellules déjà déduites par
// `lib/mots-croises/affichage.ts` (`grilleAffichee`) et les rend. Aucune
// règle ici — jamais de comparaison de mot, jamais de mutation de l'état.
// Même séparation que le Damier des dames et le Plateau du Ludo/de l'Awalé.
//
// Les cases noires ne sont PAS des cases vides à ignorer : contrairement
// aux cases claires du damier (purement décoratives, `aria-hidden`), elles
// font partie du sens de cette grille — un joueur qui l'explore au lecteur
// d'écran doit les rencontrer et savoir qu'elles ne se jouent pas, pas les
// voir disparaître de l'arbre d'accessibilité.
//
// Rien ici n'est cliquable : à la différence du damier, choisir un mot se
// fait dans la liste des définitions (voir la page) — la grille reste une
// lecture, jamais une commande.
import { emplacementCouvre, type CelluleAffichee } from '@/lib/mots-croises/affichage';
import type { Emplacement } from '@/lib/mots-croises/etat';

export interface GrilleProps {
  readonly cellules: readonly (readonly CelluleAffichee[])[];
  /** L'emplacement en cours de saisie, mis en évidence — `null` si aucun. */
  readonly selection: Emplacement | null;
}

export function Grille({ cellules, selection }: GrilleProps) {
  return (
    <div
      role="grid"
      aria-label="Grille de mots croisés"
      className="grid aspect-square w-full max-w-[min(92vw,26rem)] grid-cols-5 gap-1 rounded-2xl border border-cream/14 bg-plum-card/45 p-1.5"
    >
      {cellules.map((rangee, ligne) => (
        // `display: contents` — la ligne existe pour l'arbre
        // d'accessibilité (une grille sans `row` est invalide) mais ne doit
        // pas s'interposer dans la grille CSS, dont les 25 cellules sont
        // posées d'un seul tenant par `grid-cols-5`.
        <div key={ligne} role="row" className="contents">
          {rangee.map((cellule, colonne) => {
            if (cellule.type === 'noire') {
              return (
                <div
                  key={`${ligne}-${colonne}`}
                  role="gridcell"
                  aria-label="case noire, non jouable"
                  className="rounded-md bg-ink"
                />
              );
            }

            const enSurbrillance =
              selection !== null && emplacementCouvre(selection, ligne, colonne);

            return (
              <div
                key={`${ligne}-${colonne}`}
                role="gridcell"
                aria-label={
                  cellule.lettre === null ? 'case non trouvée' : `lettre ${cellule.lettre}`
                }
                className={`flex items-center justify-center rounded-md border text-lg font-bold uppercase text-cream transition-colors ${
                  enSurbrillance ? 'border-gold bg-gold/15' : 'border-cream/12 bg-plum-card'
                }`}
              >
                <span aria-hidden>{cellule.lettre ?? ''}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
