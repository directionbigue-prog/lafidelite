// /questions-pour-couple — page de contenu pour la recherche « questions pour
// couple » (16/10/2026).
//
// Les exemples sont de vraies questions du jeu, choisies par slug dans la
// banque (`lib/seo/contenus.ts`), et seulement leur ÉNONCÉ : les choix et
// leur poids font le jeu, ils ne se publient pas. Composant serveur — la
// banque de questions ne doit entrer dans aucun bundle client.
import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { SuiteDeLecture } from '@/components/landing/SuiteDeLecture';
import { TOTAL_QUESTIONS } from '@/lib/landing/design-data';
import { echantillonParManche, themesAvecCompte } from '@/lib/seo/contenus';
import { metadataDePage } from '@/lib/seo/pages';

export const metadata: Metadata = metadataDePage('/questions-pour-couple');

export default function QuestionsPourCouplePage() {
  const manches = echantillonParManche();
  const themes = themesAvecCompte();

  return (
    <AppShell active="accueil" acces="public">
      <article className="flex max-w-3xl flex-col gap-10">
        <header>
          <p className="text-[11px] uppercase tracking-[0.16em] text-cream/50">
            Questions pour couple
          </p>
          <h1 className="mt-2 font-serif text-[clamp(30px,4.5vw,44px)] leading-[1.05]">
            Des questions pour couple qui font vraiment parler
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-cream/65">
            Les questions de Cœur Fidèle ne cherchent pas à piéger : elles mettent des mots sur ce
            dont on parle rarement à deux — la confiance, l’argent, la famille, les projets. En
            voici quelques-unes, tirées du jeu tel qu’il est, manche par manche.
          </p>
        </header>

        {manches.map((manche) => (
          <section key={manche.type} className="flex flex-col gap-3">
            <h2 className="font-serif text-2xl">{manche.titre}</h2>
            <p className="text-sm text-cream/55">{manche.regle}</p>
            <ul className="flex flex-col gap-2">
              {manche.questions.map((question) => (
                <li
                  key={question}
                  className="rounded-2xl border border-cream/12 bg-plum-card p-4 text-[15px] leading-relaxed text-cream/85"
                >
                  {question}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="flex flex-col gap-4">
          <h2 className="font-serif text-2xl">
            {TOTAL_QUESTIONS} questions, {themes.length} thèmes
          </h2>
          <p className="text-[15px] leading-relaxed text-cream/65">
            À chaque partie, vous choisissez les thèmes qui vous parlent. Une question déjà jouée ne
            revient qu’une fois le thème presque entièrement parcouru.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {themes.map((theme) => (
              <li
                key={theme.nom}
                className="rounded-2xl border border-cream/12 bg-plum-card/50 p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold">{theme.nom}</h3>
                  <span className="shrink-0 text-xs text-gold">{theme.questions} questions</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-cream/60">{theme.resume}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-cream/12 bg-plum-card2 p-5">
          <p className="text-sm leading-relaxed text-cream/65">
            Les réponses de votre partenaire ne se dévoilent qu’à la fin de chaque manche, et aucun
            historique individuel n’est consultable. Le score mesure des réponses à des situations
            imaginaires : il ne dit pas qui est fidèle.
          </p>
        </section>

        <SuiteDeLecture ici="/questions-pour-couple" />
      </article>
    </AppShell>
  );
}
