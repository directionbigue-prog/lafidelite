// /jeux-a-deux — page de contenu pour la recherche « jeux à deux » (16/10/2026).
//
// Les jeux et leur but viennent du registre du Salon (`lib/salon/jeux.ts`,
// `regles.ts`) ; le palier qui ouvre le Salon vient du registre des packs,
// via `salonAcces`. Le Salon n'est PAS gratuit — Découverte porte
// `salon: false`, et le serveur répond `SALON_LOCKED` — et cette page ne doit
// pas le laisser croire (`contenus.test.ts`).
import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { SuiteDeLecture } from '@/components/landing/SuiteDeLecture';
import { buildLandingDesignData } from '@/lib/landing/design-data';
import { jeuxDuSalon } from '@/lib/seo/contenus';
import { metadataDePage } from '@/lib/seo/pages';

export const metadata: Metadata = metadataDePage('/jeux-a-deux');

export default function JeuxADeuxPage() {
  const jeux = jeuxDuSalon();
  const { salonAcces } = buildLandingDesignData();

  return (
    <AppShell active="accueil" acces="public">
      <article className="flex max-w-3xl flex-col gap-10">
        <header>
          <p className="text-[11px] uppercase tracking-[0.16em] text-cream/50">Le Salon</p>
          <h1 className="mt-2 font-serif text-[clamp(30px,4.5vw,44px)] leading-[1.05]">
            Jeux à deux sur un seul téléphone
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-cream/65">
            Le Salon de Cœur Fidèle réunit {jeux.length} jeux de plateau et de lettres à jouer à
            deux, sur le même téléphone : chacun joue son coup, puis passe l’appareil. Une partie se
            reprend là où vous l’avez laissée.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-2xl">Les {jeux.length} jeux</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {jeux.map((jeu) => (
              <li key={jeu.kind} className="rounded-2xl border border-cream/12 bg-plum-card p-5">
                <h3 className="font-serif text-xl">{jeu.nom}</h3>
                <p className="mt-2 text-sm leading-relaxed text-cream/65">{jeu.but}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-2xl">Qui peut y jouer</h2>
          <ul className="flex flex-col gap-2 text-[15px] leading-relaxed text-cream/70">
            <li>
              <span className="text-gold">·</span> {salonAcces} : un pack pris par l’un de vous vaut
              pour le couple.
            </li>
            <li>
              <span className="text-gold">·</span> Pas encore de partenaire inscrit ? Le Salon se
              joue aussi avec un compte seul : le second joueur s’appelle simplement « Joueur 2 ».
            </li>
            <li>
              <span className="text-gold">·</span> Ici, il y a un gagnant — mais les parties du
              Salon ne comptent jamais dans le score de votre couple.
            </li>
          </ul>
        </section>

        <SuiteDeLecture ici="/jeux-a-deux" />
      </article>
    </AppShell>
  );
}
