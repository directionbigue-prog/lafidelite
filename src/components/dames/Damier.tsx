'use client';

// Le damier, et rien d'autre.
//
// Ce composant ne connaît AUCUNE règle : il reçoit les cases jouables et
// les destinations proposées, il les affiche et il signale les clics. Tout
// l'arbitrage vit dans `lib/dames/`, ce qui garde le moteur testable sans
// DOM et ce rendu remplaçable sans toucher aux règles.
//
// Les couleurs sont celles du canevas de design, relevées dans son code :
// cases jouables #3D2036, cases inertes #EFE3D6, un camp crème bordé de
// prune, l'autre wine bordé de crème. Les deux teintes du damier sont
// déclarées comme tokens dans tailwind.config.ts — pas d'hexadécimal ici.
import { coordonnees, NB_CASES } from '@/lib/dames/plateau';
import { pieceEn, type Camp, type EtatPlateau } from '@/lib/dames/etat';

export interface DamierProps {
  readonly etat: EtatPlateau;
  /** Cases sur lesquelles on peut cliquer maintenant. */
  readonly jouables: readonly number[];
  /** La pièce sélectionnée, s'il y en a une. */
  readonly selection: number | null;
  /** Destinations proposées pour la sélection courante. */
  readonly destinations: readonly number[];
  readonly onCase: (caseNum: number) => void;
  /** Nom affiché de chaque camp, pour l'accessibilité. */
  readonly noms: Readonly<Record<Camp, string>>;
}

// Les deux camps du canevas : un pion crème bordé de prune, un pion wine
// bordé de crème. Le camp `blanc` du moteur est le camp crème — c'est la
// seule correspondance à retenir entre le vocabulaire des règles et celui
// de l'écran.
const PIECE: Record<Camp, string> = {
  blanc: 'bg-cream ring-2 ring-inset ring-plum-deep/40',
  noir: 'bg-wine ring-2 ring-inset ring-cream/55',
};

// Une dame porte un anneau intérieur de la couleur adverse — repris du
// canevas, où la pièce promue se distingue par son liseré.
const ANNEAU_DAME: Record<Camp, string> = {
  blanc: 'border-wine',
  noir: 'border-cream/85',
};

export function Damier({ etat, jouables, selection, destinations, onCase, noms }: DamierProps) {
  // Le damier 10×10 : 50 cases sombres jouables, 50 claires décoratives.
  // Construit rangée par rangée, car une grille ARIA valide exige des
  // lignes entre la grille et ses cellules.
  const rangees: (number | null)[][] = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => null),
  );
  for (let n = 1; n <= NB_CASES; n += 1) {
    const { rangee, colonne } = coordonnees(n);
    const ligne = rangees[rangee];
    if (ligne !== undefined) ligne[colonne] = n;
  }

  return (
    <div
      role="grid"
      aria-label="Damier"
      className="grid aspect-square w-full max-w-[min(92vw,32rem)] grid-cols-10 overflow-hidden rounded-2xl border border-cream/14"
    >
      {rangees.map((ligne, rangee) => (
        // `display: contents` — la ligne existe pour l'arbre
        // d'accessibilité (une grille sans `row` est invalide) mais ne doit
        // pas s'interposer dans la grille CSS, dont les 100 cellules sont
        // posées d'un seul tenant par `grid-cols-10`.
        <div key={rangee} role="row" className="contents">
          {ligne.map((caseNum, colonne) => {
            // Les cases claires ne sont jamais jouables. Les annoncer
            // doublerait la longueur du damier pour un lecteur d'écran.
            if (caseNum === null) {
              return <div key={`${rangee}-${colonne}`} aria-hidden className="bg-damier-clair" />;
            }

            const piece = pieceEn(etat.cases, caseNum);
            const selectionnee = selection === caseNum;
            const destination = destinations.includes(caseNum);
            const cliquable = jouables.includes(caseNum) || destination;

            // Une pièce que l'on peut prendre en main, pas encore choisie.
            //
            // Ce liseré n'est pas décoratif : c'est la prise obligatoire
            // rendue VISIBLE. `jouables` ne contient que les pièces ayant un
            // coup légal — donc, dès qu'une prise existe, uniquement celles
            // qui prennent, et parmi elles uniquement celles qui prennent le
            // maximum. Sans lui, la règle n'existait qu'en toutes lettres
            // sous le plateau, et un joueur qui touchait une autre pièce ne
            // voyait rien se produire sans comprendre pourquoi.
            const mobilisable = cliquable && piece !== null && !selectionnee;

            const description =
              piece === null
                ? `case ${caseNum}, vide`
                : `case ${caseNum}, ${piece.dame ? 'dame' : 'pion'} ${noms[piece.camp]}`;

            // `aria-selected`, et jamais `aria-pressed` : `role="gridcell"`
            // écrase le rôle implicite `button`, et `aria-pressed` n'est un
            // état que de `role="button"`. Posé sur une cellule de grille,
            // il n'est pas dans la liste des états autorisés — les
            // technologies d'assistance l'ignorent, et la sélection d'une
            // pièce n'était donc jamais annoncée, alors qu'elle est la
            // moitié de l'interaction de ce jeu (l'anneau doré de la ligne
            // ci-dessous est purement visuel).
            //
            // Omis plutôt que `false` sur les cases non sélectionnées : le
            // poser sur les 50 cases sombres, cases vides comprises, ferait
            // annoncer « non sélectionné » à chaque case traversée.
            return (
              <button
                key={`${rangee}-${colonne}`}
                type="button"
                role="gridcell"
                aria-label={destination ? `${description} — destination possible` : description}
                aria-selected={selectionnee ? true : undefined}
                disabled={!cliquable}
                onClick={() => onCase(caseNum)}
                className={`relative flex items-center justify-center bg-damier-fonce transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold ${
                  selectionnee
                    ? 'ring-2 ring-inset ring-gold'
                    : mobilisable
                      ? 'ring-1 ring-inset ring-gold/45'
                      : ''
                } ${cliquable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {piece !== null && (
                  <span
                    aria-hidden
                    className={`flex h-[78%] w-[78%] items-center justify-center rounded-full shadow-[0_1px_3px_rgba(0,0,0,.45)] ${PIECE[piece.camp]}`}
                  >
                    {/* La dame porte un anneau ; son nom accessible la dit aussi. */}
                    {piece.dame && (
                      <span
                        className={`h-[38%] w-[38%] rounded-full border-2 ${ANNEAU_DAME[piece.camp]}`}
                      />
                    )}
                  </span>
                )}
                {/* Une destination libre : un point, jamais une bordure — une
                    bordure sur une case vide se lit comme une pièce. */}
                {destination && piece === null && (
                  <span aria-hidden className="h-[26%] w-[26%] rounded-full bg-gold/70" />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
