'use client';

// Le plateau d'Awalé, et rien d'autre.
//
// Comme le Damier des dames, ce composant ne connaît AUCUNE règle : il
// reçoit les trous jouables et signale les clics. Tout l'arbitrage vit dans
// `lib/awale/`, ce qui garde le moteur testable sans DOM et ce rendu
// remplaçable sans toucher aux règles.
//
// ── Orientation — l'erreur la plus facile à commettre ici ─────────────
// Les trous sont numérotés 0 à 11 dans le SENS DU SEMIS : l'anneau va
// toujours de 0 vers 11 puis revient à 0. `sud` possède 0-5, `nord`
// possède 6-11.
//
// La rangée du bas (sud) se lit de gauche à droite : 0, 1, 2, 3, 4, 5.
// La rangée du haut (nord) se lit de DROITE À GAUCHE : 6 est affiché à
// droite, 11 à gauche. Une rangée du haut affichée 6→11 de gauche à
// droite semblerait tout aussi naturelle, mais elle inverserait le sens
// du jeu à l'écran : le semis qui quitte le trou 5 (bas-droite) doit
// atteindre le trou 6 en tournant, donc 6 doit être visuellement adjacent
// à 5 — à droite, pas à gauche. Le tour complet de l'anneau se lit alors
// en U, jamais en zigzag.
import { grainesEn, campDuTrou, type Camp, type EtatAwale } from '@/lib/awale/etat';

export interface PlateauProps {
  readonly etat: EtatAwale;
  /** Trous sur lesquels on peut cliquer maintenant. */
  readonly jouables: readonly number[];
  /**
   * Le dernier trou joué, s'il y en a un — pas une sélection en attente :
   * à l'Awalé un coup est un seul clic, il n'y a rien à composer avant de
   * jouer. Marquer le dernier coup joué est ce qui reprend, ici, le rôle
   * que l'état sélectionné joue aux dames : un repère visuel plus appuyé
   * que le simple liseré des trous jouables.
   */
  readonly dernierCoup: number | null;
  readonly onTrou: (trou: number) => void;
  /** Nom affiché de chaque camp, pour l'accessibilité et les greniers. */
  readonly noms: Readonly<Record<Camp, string>>;
}

// La rangée du haut, affichée de droite à gauche : 6 à droite, 11 à gauche.
const RANGEE_NORD: readonly number[] = [11, 10, 9, 8, 7, 6];
const RANGEE_SUD: readonly number[] = [0, 1, 2, 3, 4, 5];

function Grenier({ nom, valeur }: { readonly nom: string; readonly valeur: number }) {
  return (
    <div className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-cream/14 bg-plum-card/55 py-4">
      <span className="text-2xl font-semibold tabular-nums text-cream">{valeur}</span>
      <span className="text-center text-[10px] uppercase leading-tight tracking-wide text-cream/55">
        {nom}
      </span>
    </div>
  );
}

export function Plateau({ etat, jouables, dernierCoup, onTrou, noms }: PlateauProps) {
  function rangee(trous: readonly number[]) {
    return (
      <div role="row" className="contents">
        {trous.map((trou) => {
          const graines = grainesEn(etat.trous, trou);
          const camp = campDuTrou(trou);
          const cliquable = jouables.includes(trou);
          // Un trou qu'on peut jouer maintenant, pas encore choisi — le
          // même rôle que `mobilisable` sur le Damier : rendre la règle
          // (ici, l'obligation de nourrir) visible sans qu'il faille la
          // lire sous le plateau.
          const jouable = cliquable && dernierCoup !== trou;
          const joueEnDernier = dernierCoup === trou;

          const description = `trou ${trou}, ${graines} ${graines === 1 ? 'graine' : 'graines'}, ${noms[camp]}`;

          // `aria-selected`, jamais `aria-pressed` : `role="gridcell"`
          // écrase le rôle implicite `button`, et `aria-pressed` n'est un
          // état que de `role="button"` — posé ici il serait ignoré des
          // technologies d'assistance. Omis plutôt que `false` sur les
          // trous non marqués : le poser sur les douze trous ferait
          // annoncer « non sélectionné » à chacun d'eux.
          return (
            <button
              key={trou}
              type="button"
              role="gridcell"
              aria-label={description}
              aria-selected={joueEnDernier ? true : undefined}
              disabled={!cliquable}
              onClick={() => onTrou(trou)}
              className={`relative flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold ${
                joueEnDernier
                  ? 'border-gold bg-gold/10'
                  : jouable
                    ? 'border-gold/45 bg-plum-card/45'
                    : 'border-cream/10 bg-plum-card/35'
              } ${cliquable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className="text-lg font-semibold tabular-nums text-cream">{graines}</span>
              <span className="text-[10px] text-cream/50">{trou}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[min(92vw,36rem)] items-stretch gap-2">
      <Grenier nom={noms.nord} valeur={etat.greniers.nord} />
      <div
        role="grid"
        aria-label="Plateau d'Awalé"
        className="grid flex-1 grid-cols-6 grid-rows-2 gap-2"
      >
        {rangee(RANGEE_NORD)}
        {rangee(RANGEE_SUD)}
      </div>
      <Grenier nom={noms.sud} valeur={etat.greniers.sud} />
    </div>
  );
}
