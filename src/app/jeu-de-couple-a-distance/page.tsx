// /jeu-de-couple-a-distance — page de contenu pour la recherche « jeu de
// couple à distance » (16/10/2026).
//
// Deux promesses à tenir, toutes deux vérifiées par `contenus.test.ts` :
// deux téléphones (vrai tant que l'écran d'attente de `jeu/[id]/passe` sait
// attendre), et jamais le simultané ni l'image — le moteur joue tour à tour,
// et l'appel vidéo a été retiré le 13/10/2026.
import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { SuiteDeLecture } from '@/components/landing/SuiteDeLecture';
import { roundLabel, TOTAL_ROUNDS } from '@/lib/game/round-labels';
import { metadataDePage } from '@/lib/seo/pages';

export const metadata: Metadata = metadataDePage('/jeu-de-couple-a-distance');

const ETAPES = [
  {
    titre: 'Créez votre Espace Couple',
    texte:
      'L’un de vous crée un compte et reçoit un code à six chiffres. L’autre l’ouvre sur son téléphone, tape son prénom, et vous voilà réunis, sans avoir à vous inscrire tous les deux.',
  },
  {
    titre: 'Activez « Chacun sur son téléphone »',
    texte:
      'Sur l’écran du jeu, sur vos deux téléphones. Le réglage reste mémorisé sur chaque appareil : vous ne le faites qu’une fois.',
  },
  {
    titre: 'Répondez tour à tour',
    texte:
      'Quand c’est au tour de votre partenaire, votre écran affiche qu’il ou elle répond, puis suit la partie de lui-même. Plus besoin de se passer le téléphone.',
  },
] as const;

export default function JeuADistancePage() {
  const manches = Array.from({ length: TOTAL_ROUNDS }, (_, i) => roundLabel(i + 1)?.title).filter(
    (titre): titre is string => Boolean(titre),
  );

  return (
    <AppShell active="accueil" acces="public">
      <article className="flex max-w-3xl flex-col gap-10">
        <header>
          <p className="text-[11px] uppercase tracking-[0.16em] text-cream/50">Jouer à distance</p>
          <h1 className="mt-2 font-serif text-[clamp(30px,4.5vw,44px)] leading-[1.05]">
            Un jeu de couple à distance, chacun sur son téléphone
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-cream/65">
            Vous n’êtes pas au même endroit ce soir ? Cœur Fidèle se joue aussi sur deux téléphones
            : chacun répond sur le sien, tour à tour, et les réponses se révèlent à la fin de chaque
            manche. La distance change l’écran, pas le jeu.
          </p>
        </header>

        <section className="flex flex-col gap-4">
          <h2 className="font-serif text-2xl">Comment ça marche</h2>
          <ol className="flex flex-col gap-3">
            {ETAPES.map((etape, i) => (
              <li
                key={etape.titre}
                className="flex gap-4 rounded-2xl border border-cream/12 bg-plum-card p-5"
              >
                <span className="font-serif text-2xl text-gold">{i + 1}</span>
                <div>
                  <h3 className="font-semibold">{etape.titre}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-cream/65">{etape.texte}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-2xl">Ce qui ne change pas</h2>
          <ul className="flex flex-col gap-2 text-[15px] leading-relaxed text-cream/70">
            <li>
              <span className="text-gold">·</span> Les mêmes questions et les mêmes {TOTAL_ROUNDS}{' '}
              manches : {manches.join(', ')}.
            </li>
            <li>
              <span className="text-gold">·</span> Un score commun : vous jouez ensemble, jamais
              l’un contre l’autre.
            </li>
            <li>
              <span className="text-gold">·</span> Les réponses de l’autre restent cachées jusqu’à
              la fin de la manche, et aucun historique individuel n’est consultable.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-2xl">Ce qu’il vous faut</h2>
          <p className="text-[15px] leading-relaxed text-cream/70">
            Deux téléphones connectés à internet, et rien à installer : le jeu s’ouvre dans le
            navigateur. Si vous voulez vous entendre pendant la partie, gardez simplement un appel
            ouvert à côté.
          </p>
        </section>

        <SuiteDeLecture ici="/jeu-de-couple-a-distance" />
      </article>
    </AppShell>
  );
}
