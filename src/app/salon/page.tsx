'use client';

// /salon — « Le Salon », la rubrique des jeux complémentaires.
//
// Nom, route et copie viennent du canevas de design, qui montre l'URL en
// clair dans sa maquette web (coeurfidele.com/salon).
//
// Cinq jeux y figurent, et les cinq sont désormais jouables : les dames,
// l'Awalé, le Ludo, Le Mot, puis les mots croisés — dernier arrivé. Le
// canevas de design annonçait « Mots croisés » sans qu'aucun lien ne
// puisse exister à l'époque : les mots croisés ont besoin de DÉFINITIONS,
// que la licence retenue pour le dictionnaire du Mot (MIT, mots seuls) ne
// fournit pas — voir sa spec, « Ce que la recherche a établi ». La spec des
// mots croisés a résolu ça autrement : des définitions écrites à la main
// pour ce produit plutôt que puisées au Wiktionnaire (voir
// docs/superpowers/specs/2026-09-10-mots-croises-design.md) — d'où la carte
// qui suit, avec son propre nom et sa propre durée.
//
// Le canevas affiche un prix en points sur trois des quatre jeux. Il n'est
// pas repris : l'économie de points n'existe pas en base, et un prix que
// rien ne prélève est une promesse que le produit ne tient pas. La colonne
// reste en place et porte « Offert », prête à recevoir un prix le jour où
// il sera réel.
//
// Trois éléments du canevas sont volontairement absents, faute de ce sur
// quoi ils reposent : le solde de points de la barre latérale, la carte
// « Tournoi du couple » (trois victoires d'affilée offrent une partie —
// il faudrait compter les victoires), et la bannière de présence
// « Malick vous attend au Ludo » (mode deux appareils, lot séparé).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/contexts/AuthContext';
import { AppShell } from '@/components/app/AppShell';
import { partieEnCours } from '@/lib/salon/api';

interface JeuDuSalon {
  readonly nom: string;
  readonly glyphe: string;
  readonly duree: string;
  readonly href: string | null;
  /** L'identifiant serveur du jeu, quand une partie peut être en cours. */
  readonly kind: string | null;
}

const JEUX: readonly JeuDuSalon[] = [
  {
    nom: 'Jeu de dames',
    glyphe: '◉',
    duree: 'Deux joueurs · 15 min',
    href: '/salon/dames',
    kind: 'DAMES',
  },
  {
    nom: 'Ludo',
    glyphe: '⬤',
    duree: 'Deux joueurs · 10 min',
    href: '/salon/ludo',
    kind: 'LUDO',
  },
  {
    nom: 'Mots croisés',
    glyphe: '#',
    duree: 'Deux joueurs · 20 min',
    href: '/salon/mots-croises',
    kind: 'MOTS_CROISES',
  },
  {
    nom: 'Awalé',
    glyphe: '◍',
    duree: 'Deux joueurs · 12 min',
    href: '/salon/awale',
    kind: 'AWALE',
  },
  {
    nom: 'Le Mot',
    glyphe: 'W',
    duree: 'Deux joueurs · 10 min',
    href: '/salon/mot',
    kind: 'MOT',
  },
];

export default function SalonPage() {
  const user = useUser('/connexion');
  // Les jeux dont une partie attend d'être reprise. Le menu se contente de
  // LIRE : `partieEnCours` interroge `GET /api/salon/current`, qui ne crée
  // rien — ouvrir le Salon ne doit pas ouvrir de parties.
  const [reprises, setReprises] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    let annule = false;
    // `flatMap` plutôt que `filter` : il rétrécit réellement le type de
    // `kind` à `string`, là où `filter` laisserait un `string | null` que
    // seul un cast de complaisance ferait taire.
    const jouables = JEUX.flatMap((jeu) =>
      jeu.kind === null ? [] : [{ nom: jeu.nom, kind: jeu.kind }],
    );
    Promise.all(
      jouables.map((jeu) =>
        // Le nom du jeu plutôt que son `kind` brut : c'est lui qui sert de
        // clé au rendu. Un échec ne coûte qu'une étiquette absente — jamais
        // l'accès au jeu, qui reste cliquable.
        partieEnCours(jeu.kind)
          .then((partie) => (partie === null ? null : jeu.nom))
          .catch(() => null),
      ),
    ).then((noms) => {
      if (!annule) setReprises(new Set(noms.filter((n): n is string => n !== null)));
    });
    return () => {
      annule = true;
    };
  }, [user]);

  if (!user) return null;

  return (
    <AppShell active="salon">
      <div className="flex max-w-2xl flex-col gap-8">
        <header>
          <p className="text-[11px] uppercase tracking-[0.16em] text-cream/50">Divertissement</p>
          <h1 className="mt-2 font-serif text-[clamp(30px,4.5vw,44px)] leading-[1.05]">Le Salon</h1>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-cream/70">
            {
              'Des parties plus légères, entre deux Cœur Fidèle. Elles ne comptent pas dans votre Score de Fidélité — c’est le seul endroit de l’app où il y a un gagnant.'
            }
          </p>
        </header>

        <div className="flex flex-col gap-3">
          {JEUX.map((jeu) => {
            const contenu = (
              <>
                <span
                  aria-hidden
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cream/10 text-lg"
                >
                  {jeu.glyphe}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-serif text-xl">{jeu.nom}</span>
                  <span className="mt-0.5 block text-sm text-cream/55">{jeu.duree}</span>
                </span>
              </>
            );

            if (jeu.href === null) {
              return (
                <div
                  key={jeu.nom}
                  className="flex items-center gap-4 rounded-2xl border border-cream/10 bg-plum-card/30 p-4 opacity-60"
                >
                  {contenu}
                  <span className="shrink-0 rounded-full border border-cream/24 px-2.5 py-0.5 text-[11px] font-semibold text-cream/60">
                    Bientôt
                  </span>
                </div>
              );
            }

            // Une partie attend d'être reprise. C'est l'information la plus
            // utile de cette page : sans elle, rien ne distingue « lancer une
            // partie » de « retrouver celle d'hier soir », alors qu'un couple
            // n'en a qu'une à la fois par jeu.
            const aReprendre = reprises.has(jeu.nom);

            return (
              <Link
                key={jeu.nom}
                href={jeu.href}
                className={`flex items-center gap-4 rounded-2xl border bg-plum-card/50 p-4 transition-colors hover:border-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                  aReprendre ? 'border-gold/55' : 'border-cream/14'
                }`}
              >
                {contenu}
                {aReprendre ? (
                  <span className="shrink-0 rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-semibold text-gold max-md:text-[12px]">
                    Reprendre
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold max-md:text-[12px]">
                    Offert
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
