'use client';

// Le plateau de Ludo, et rien d'autre.
//
// Comme le Damier des dames et le Plateau de l'Awalé, ce composant ne
// connaît AUCUNE règle : il affiche l'état, il ne décide de rien. Tout
// l'arbitrage vit dans `lib/ludo/`.
//
// ── La décision de disposition ──────────────────────────────────────────
// Un plateau de Ludo classique est une croix à quatre bras, avec deux
// enclos et deux colonnes d'arrivée inutilisées : ce jeu n'a que deux
// camps, diamétralement opposés sur le circuit (voir la spec). Reproduire
// la croix à quatre bras aurait dessiné deux enclos et deux bras que
// personne ne joue jamais — plus de surface à lire sur un téléphone, pour
// une information qui n'existe pas dans cette variante.
//
// À la place : le circuit commun de 52 cases est déplié en un ruban de
// quatre rangées de 13, lu en boustrophédon (une rangée sur deux se lit à
// l'envers) — même principe que les deux rangées de l'Awalé — pour que
// l'anneau se dessine sans dents de scie. Chaque camp garde son enclos et
// sa colonne d'arrivée juste à côté du ruban, du côté qui lui correspond
// (nord au-dessus, sud en-dessous, comme aux dames et à l'Awalé). Les deux
// cases sûres (les entrées, `estCaseSure`) sont surlignées en or : c'est la
// seule sécurité du plateau, elle doit se voir sans qu'il faille lire une
// légende.
//
// ── Ce plateau est un AFFICHAGE, pas la surface de jeu ───────────────────
// Une case de ce ruban fait environ 28px sur un téléphone de 375px — bien
// sous les 48px que ce dépôt s'impose pour une cible tactile. Faire du
// pion lui-même le bouton (comme la première version de cet écran l'a
// tenté) est donc géométriquement impossible à rendre praticable : deux
// personnes qui se passent le téléphone rateraient un pion sur deux, avec
// des voisins à quelques pixels.
//
// Le choix retenu suit jusqu'au bout le constat qui a motivé la
// disposition ci-dessus : un coup de Ludo choisit un PION, pas une case
// (le générateur de coups de `lib/ludo/coups.ts` rend des index de pions —
// voir son en-tête). Rien n'oblige ce choix à se FAIRE sur le plateau. Ce
// composant se contente donc de montrer où sont les pions, quelles cases
// sont sûres et ce qu'il reste à parcourir ; l'action vit dans la rangée
// de vrais boutons que l'écran affiche sous le plateau (voir
// `app/salon/ludo/page.tsx`), un par pion jouable, à 48px de haut minimum.
// Chaque pion redevient donc un simple marqueur visuel — `role="img"` avec
// un nom accessible, plus aucun élément cliquable — et le lien entre un
// bouton d'action et son pion se fait par `pionSurligne` : la page le pose
// au survol ou au focus du bouton correspondant, pour que le joueur voie
// tout de suite QUEL pion il s'apprête à jouer.
import { pionEn, type Camp, type EtatLudo, type Pion } from '@/lib/ludo/etat';
import {
  DISTANCE_ARRIVEE,
  TAILLE_CIRCUIT,
  TAILLE_COLONNE,
  caseAbsolue,
  distanceDe,
  estCaseSure,
} from '@/lib/ludo/plateau';

/** Le pion à mettre en évidence sur le plateau — survolé ou focalisé dans la rangée d'actions. */
export interface PionSurligne {
  readonly camp: Camp;
  readonly index: number;
}

export interface PlateauProps {
  readonly etat: EtatLudo;
  /** `null` quand aucun bouton d'action n'est survolé ou focalisé. */
  readonly pionSurligne: PionSurligne | null;
  /** Nom affiché de chaque camp, pour l'accessibilité. */
  readonly noms: Readonly<Record<Camp, string>>;
}

const CAMPS_ORDRE: readonly Camp[] = ['sud', 'nord'];

// Le pion sud est wine, le pion nord crème bordé de prune — les mêmes
// teintes que les dames et l'Awalé pour les deux mêmes camps.
const PION_STYLE: Record<Camp, string> = {
  sud: 'bg-wine',
  nord: 'bg-cream ring-1 ring-inset ring-plum-deep/45',
};

// 52 cases communes dépliées en quatre rangées de 13.
const COLONNES_CIRCUIT = 13;

function rangeesCircuit(): readonly (readonly number[])[] {
  const rangees: number[][] = [];
  for (let r = 0; r < TAILLE_CIRCUIT / COLONNES_CIRCUIT; r += 1) {
    const debut = r * COLONNES_CIRCUIT;
    const cases = Array.from({ length: COLONNES_CIRCUIT }, (_, i) => debut + i);
    // Boustrophédon : une rangée sur deux se lit de droite à gauche, pour
    // que le ruban se dessine comme un anneau continu.
    rangees.push(r % 2 === 0 ? cases : [...cases].reverse());
  }
  return rangees;
}

interface Occupant {
  readonly camp: Camp;
  readonly index: number;
}

/** Les pions en zone `circuit`, groupés par case absolue du circuit commun. */
function occupantsDuCircuit(etat: EtatLudo): ReadonlyMap<number, readonly Occupant[]> {
  const carte = new Map<number, Occupant[]>();
  for (const camp of CAMPS_ORDRE) {
    etat.pions[camp].forEach((pion, index) => {
      if (pion.zone !== 'circuit') return;
      const c = caseAbsolue(camp, pion.progression);
      const liste = carte.get(c);
      if (liste === undefined) carte.set(c, [{ camp, index }]);
      else liste.push({ camp, index });
    });
  }
  return carte;
}

/**
 * Le nom accessible d'un pion : son lieu, et — hors enclos et arrivée — le
 * chemin qu'il lui reste à parcourir. C'est ce qui rend « quel chemin il
 * reste à parcourir » lisible sans avoir à compter les cases à l'écran.
 */
function descriptionPion(pion: Pion, nom: string, caseCircuit: number | null): string {
  if (pion.zone === 'enclos') return `Pion de ${nom}, dans l’enclos`;
  if (pion.zone === 'arrivee') return `Pion de ${nom}, arrivé`;
  const restant = DISTANCE_ARRIVEE - distanceDe(pion);
  const suffixeRestant = `${restant} case${restant === 1 ? '' : 's'} avant l’arrivée`;
  if (pion.zone === 'circuit' && caseCircuit !== null) {
    const surete = estCaseSure(caseCircuit) ? ', case sûre' : '';
    return `Pion de ${nom}, case ${caseCircuit}${surete}, ${suffixeRestant}`;
  }
  return `Pion de ${nom}, colonne d’arrivée, ${suffixeRestant}`;
}

export function Plateau({ etat, pionSurligne, noms }: PlateauProps) {
  const occupants = occupantsDuCircuit(etat);

  /**
   * Le marqueur d'un pion — un élément nommé, jamais cliquable : ce
   * plateau n'est plus la surface de jeu (voir l'en-tête), donc le pion
   * n'a plus rien à faire au clic. `role="img"` garde le nom accessible
   * exposé aux technologies d'assistance sans prétendre à une interaction
   * que l'élément n'offre pas — un `<span>` nu verrait son `aria-label`
   * ignoré faute de rôle qui le supporte.
   */
  function marqueur(camp: Camp, index: number, cle: string, caseCircuit: number | null) {
    const pion = pionEn(etat.pions[camp], index);
    const surligne = pionSurligne?.camp === camp && pionSurligne.index === index;
    return (
      <span
        key={cle}
        role="img"
        aria-label={descriptionPion(pion, noms[camp], caseCircuit)}
        className={`h-5 w-5 shrink-0 rounded-full border border-ink/35 transition-transform ${
          PION_STYLE[camp]
        } ${surligne ? 'scale-125 ring-2 ring-gold' : ''}`}
      />
    );
  }

  function enclos(camp: Camp) {
    const indices = etat.pions[camp]
      .map((pion, index) => ({ pion, index }))
      .filter(({ pion }) => pion.zone === 'enclos');
    return (
      <div
        role="group"
        aria-label={`Enclos de ${noms[camp]}`}
        className="flex min-h-14 w-14 shrink-0 flex-wrap content-center justify-center gap-1.5 rounded-2xl border border-cream/14 bg-plum-card/40 p-1.5"
      >
        {indices.map(({ index }) => marqueur(camp, index, `${camp}-enclos-${index}`, null))}
      </div>
    );
  }

  function colonne(camp: Camp) {
    const slots = Array.from({ length: TAILLE_COLONNE }, (_, slot) => slot);
    return (
      <div
        role="group"
        aria-label={`Colonne d’arrivée de ${noms[camp]}`}
        className="flex shrink-0 gap-1"
      >
        {slots.map((slot) => {
          const ici = etat.pions[camp]
            .map((pion, index) => ({ pion, index }))
            .filter(({ pion }) => pion.zone === 'colonne' && pion.progression === slot);
          return (
            <div
              key={slot}
              className="flex h-6 w-6 items-center justify-center rounded-md bg-gold/15"
            >
              {ici.map(({ index }) =>
                marqueur(camp, index, `${camp}-colonne-${slot}-${index}`, null),
              )}
            </div>
          );
        })}
        {/* La case d'arrivée elle-même : les pions classés s'y accumulent. */}
        <div
          role="group"
          aria-label={`Arrivée de ${noms[camp]}`}
          className="flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full bg-gold/30 px-1"
        >
          {etat.pions[camp]
            .map((pion, index) => ({ pion, index }))
            .filter(({ pion }) => pion.zone === 'arrivee')
            .map(({ index }) => marqueur(camp, index, `${camp}-arrivee-${index}`, null))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[min(92vw,34rem)] flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {enclos('nord')}
        {colonne('nord')}
      </div>

      <div
        role="grid"
        aria-label="Circuit du Ludo"
        className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-[3px] rounded-2xl border border-cream/14 bg-plum-card/40 p-1.5"
      >
        {rangeesCircuit().map((rangee, r) => (
          // `display: contents` — la ligne existe pour l'arbre
          // d'accessibilité (une grille sans `row` est invalide) mais ne
          // doit pas s'interposer dans la grille CSS.
          <div key={r} role="row" className="contents">
            {rangee.map((caseCircuit) => {
              const ici = occupants.get(caseCircuit) ?? [];
              const sure = estCaseSure(caseCircuit);
              return (
                <div
                  key={caseCircuit}
                  role="gridcell"
                  aria-label={`Case ${caseCircuit}${sure ? ', case sûre' : ''}`}
                  className={`flex h-6 flex-wrap items-center justify-center gap-0.5 rounded-md ${
                    sure ? 'bg-gold/25 ring-1 ring-gold/60' : 'bg-plum-card/45'
                  }`}
                >
                  {ici.map(({ camp, index }) =>
                    marqueur(camp, index, `circuit-${caseCircuit}-${camp}-${index}`, caseCircuit),
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        {colonne('sud')}
        {enclos('sud')}
      </div>
    </div>
  );
}
