// Le « Comment jouer ? » des écrans du Salon.
//
// ── Pourquoi `<details>` plutôt qu'un panneau maison ──────────────────
//
// Parce qu'il est déjà tout ce qu'il faut : ouvert et fermé au clavier,
// annoncé comme un dépliant par un lecteur d'écran, et fonctionnel avant
// même que le JavaScript arrive. Un `useState` et un `<div>` auraient
// demandé `aria-expanded`, `aria-controls`, la gestion d'Entrée et
// d'Espace — pour réimplémenter, moins bien, ce que le navigateur donne.
//
// ── Pourquoi replié par défaut ────────────────────────────────────────
//
// Le Salon est fait de parties qu'on reprend. Déplier les règles à chaque
// ouverture repousserait le plateau sous la ligne de flottaison pour
// quelqu'un qui joue sa dixième partie, et c'est le plateau qu'il vient
// voir. Le repli est donc le bon défaut — à condition que l'affordance se
// voie, d'où le chevron et le libellé en toutes lettres plutôt qu'un « ? »
// dans un coin.
//
// ── Ce que ce fichier ne décide pas ───────────────────────────────────
//
// Le contenu. Il vit dans `lib/salon/regles.ts`, en données pures, parce
// que c'est la seule forme que ce dépôt sait tester (ni jsdom ni Testing
// Library — voir CLAUDE.md). Ici il n'y a que de la mise en forme.
import { REGLES } from '@/lib/salon/regles';
import type { Jeu } from '@/lib/salon/jeux';

export function CommentJouer({ jeu, nom }: { jeu: Jeu; nom: string }) {
  const regle = REGLES[jeu];

  return (
    <details className="group w-full rounded-2xl border border-cream/12 bg-plum-card/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-cream/85 transition-colors hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
        {/*
          Le libellé nomme le jeu : sur un écran qui en contient déjà le
          titre, « Comment jouer ? » seul oblige à relier les deux.
        */}
        <span>Comment jouer — {nom}</span>
        {/*
          `list-none` ci-dessus retire le triangle natif, que Safari et
          Chrome ne dessinent pas de la même façon. Le chevron le remplace
          et tourne à l'ouverture ; il est décoratif, l'état ouvert/fermé
          étant déjà porté par `<details>` lui-même.
        */}
        <span aria-hidden className="shrink-0 text-gold transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>

      <div className="flex flex-col gap-4 px-4 pb-4 pt-1 text-sm leading-relaxed text-cream/70">
        <p>
          <span className="font-semibold text-cream">Le but. </span>
          {regle.but}
        </p>

        <div>
          <p className="mb-1.5 font-semibold text-cream">Votre tour</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 marker:text-gold">
            {regle.tour.map((etape) => (
              <li key={etape}>{etape}</li>
            ))}
          </ol>
        </div>

        <div>
          <p className="mb-1.5 font-semibold text-cream">À savoir</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-gold">
            {regle.aSavoir.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
