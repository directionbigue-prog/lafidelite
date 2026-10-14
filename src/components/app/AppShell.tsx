'use client';

// The signed-in "Espace Couple" shell from planche 01 of the web canvas:
// a persistent left sidebar carrying the brand, who the couple is, and the
// navigation, with the page's own content in the remaining space.
//
// This is the structural idea that makes the product a WEB app rather than
// a phone screen centred on a large display — which is exactly what the
// user reported. It is deliberately NOT applied to the in-game screens:
// planche 03 drops the sidebar entirely for a full-bleed progress header,
// because during a round the question is the only thing that should be
// competing for attention.
//
// ── Two deviations from the canvas, both deliberate ───────────────────
//  1. The canvas sidebar lists five destinations (Accueil, Nos parties,
//     Catégories, Rapport de Couple, Réglages). Three of them have no page
//     behind them today. They are omitted rather than rendered inert: this
//     codebase has a tripwire against dead internal links, and a nav that
//     lies about what exists is worse than a short one. Add the entry with
//     the route, not before. (Le Salon joined in 2026-09 with /salon — the
//     design canvas names it and shows the URL in its web mockup, so it
//     sits in the nav like the others. The canvas's other three
//     destinations still have no page.)
//  2. The canvas brand dot is gold here and wine on the auth screens. One
//     lockup per product beats matching a single artboard, so the wine dot
//     the rest of the platform already uses is kept.
//
// The canvas also pins a "Solde commun · 200 pts" card to the sidebar
// foot. There is no points economy in this build (payments are a later
// phase), so the slot is left out entirely instead of showing a figure
// nothing computes.
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { AmbientBackdrop } from '@/components/ui/AmbientBackdrop';
import { Marque } from '@/components/ui/Marque';
import { peutVoirLaConsole } from '@/lib/admin/console';

interface CoupleMeResponse {
  couple: { status?: string; partnerName?: string | null } | null;
}

export type AppSection = 'accueil' | 'rituel' | 'salon' | 'reglages' | 'administration';

const NAV: { id: AppSection; label: string; href: string }[] = [
  { id: 'accueil', label: 'Accueil', href: '/jeu' },
  { id: 'rituel', label: 'Rituel du jour', href: '/rituel' },
  { id: 'salon', label: 'Le Salon', href: '/salon' },
  { id: 'reglages', label: 'Réglages', href: '/settings' },
];

/**
 * L'entrée réservée aux administrateurs, ajoutée à la fin de la navigation.
 *
 * Elle est séparée de `NAV` parce qu'elle est conditionnelle : la console
 * n'avait aucun lien depuis le produit, et un écran qu'on ne peut atteindre
 * qu'en tapant son URL n'est pas livré. La décision vit dans
 * `peutVoirLaConsole`, qui ne garde rien — `/api/admin/*` revérifie tout.
 */
const NAV_ADMIN: { id: AppSection; label: string; href: string } = {
  id: 'administration',
  label: 'Administration',
  href: '/admin',
};

export function AppShell({
  active,
  coupleLabel: providedLabel,
  surface = 'sombre',
  large = false,
  acces = 'connecte',
  children,
}: {
  active: AppSection;
  /**
   * `public` : la page se lit sans session, et la coquille ne renvoie
   * personne vers /connexion. Seul `/tarifs` l'utilise — une page indexée,
   * dans le sitemap, dont le bouton d'achat sait déjà traiter un visiteur
   * non connecté. Par défaut, la coquille garde la session comme avant.
   */
  acces?: 'connecte' | 'public';
  /**
   * `clair` : le fond gris clair de la console d'administration (demande du
   * 14/10/2026). Le produit reste sombre partout ailleurs — le Salon en a
   * fait l'expérience, voir `app/salon/charte.test.ts`.
   */
  surface?: 'sombre' | 'clair';
  /** Contenu pleine largeur (tableaux de bord), au lieu de la colonne de lecture. */
  large?: boolean;
  /**
   * Pass it when the page already has it. Omit it and the shell fetches
   * its own.
   *
   * Both halves are load-bearing. Taking it only as a prop meant the card
   * showed on the dashboard and vanished on every other screen — chrome
   * that empties as you navigate reads as a bug. Always fetching meant the
   * dashboard asked `/api/couples/me` TWICE on every load, once here and
   * once for its own standing data, and that endpoint costs ~3s against a
   * remote Postgres.
   */
  coupleLabel?: string | null;
  children: ReactNode;
}) {
  const user = useUser(acces === 'public' ? null : '/connexion');
  const [fetchedLabel, setFetchedLabel] = useState<string | null>(null);
  const shouldFetch = providedLabel === undefined;
  const coupleLabel = shouldFetch ? fetchedLabel : providedLabel;
  // La navigation, plus l'entrée d'administration si le compte y a droit.
  // `peutVoirLaConsole` refuse un rôle absent, donc le lien n'apparaît pas
  // pendant que `/api/auth/me` est encore en vol.
  const entrees = peutVoirLaConsole(user?.role) ? [...NAV, NAV_ADMIN] : NAV;
  const clair = surface === 'clair';

  // Only runs for pages that did not supply the label themselves.
  useEffect(() => {
    if (!user || !shouldFetch) return;
    let cancelled = false;
    api<CoupleMeResponse>('/api/couples/me')
      .then((res) => {
        if (cancelled) return;
        const couple = res.couple;
        if (couple?.status === 'ACTIVE' && couple.partnerName) {
          setFetchedLabel(`${user.name ?? 'Vous'} & ${couple.partnerName}`);
        }
      })
      // A failed lookup costs a caption, never the page. The screen
      // underneath is the reason the user came.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, shouldFetch]);

  return (
    <div
      className={`relative min-h-screen font-grotesk lg:flex ${clair ? 'bg-console-fond text-ink' : 'bg-ink text-cream'}`}
    >
      {/* Les lueurs prune du fond sombre deviendraient des taches sur le gris. */}
      {!clair && <AmbientBackdrop />}

      {/*
        Below `lg` this is a header, not a sidebar: a two-item nav does not
        earn a drawer or a hamburger, and hiding two links behind a tap is
        worse than showing them.
      */}
      <aside
        className={`relative border-b px-5 py-4 sm:px-8 lg:flex lg:w-[17rem] lg:shrink-0 lg:flex-col lg:gap-7 lg:border-b-0 lg:border-r lg:px-5 lg:py-7 ${
          clair ? 'border-console-ligne bg-white' : 'border-cream/10 bg-plum-card2/70'
        }`}
      >
        <Link href="/" className="flex items-center gap-2.5 self-start">
          {/* La pastille wine qui tenait cette place était un repère du canevas,
              pas une marque. Le produit en a une depuis le 03/10 — et c'est
              justement les deux disques entrelacés que le canevas décrivait
              plus bas, à propos du couple. */}
          <Marque taille={22} />
          <span className="font-serif text-xl tracking-[0.01em]">Cœur Fidèle</span>
        </Link>

        {coupleLabel && (
          <div
            className={`mt-4 flex items-center gap-3 rounded-2xl border p-3 lg:mt-0 ${
              clair ? 'border-console-ligne bg-console-fond' : 'border-cream/12 bg-plum-card'
            }`}
          >
            {/*
              Decorative: the canvas shows two overlapping discs standing in
              for the pair. They carry no identity — there are no avatars in
              this product — so they are hidden from assistive tech and the
              names beside them do the work.
            */}
            <span aria-hidden className="flex shrink-0 items-center">
              <span className="h-7 w-7 rounded-full bg-gradient-to-br from-rose to-wine" />
              <span className="-ml-2.5 h-7 w-7 rounded-full bg-gradient-to-br from-gold to-gold-deep" />
            </span>
            <span className="min-w-0 text-sm font-semibold leading-tight">{coupleLabel}</span>
          </div>
        )}

        <nav aria-label="Espace Couple" className="mt-4 lg:mt-0">
          {/* Sur téléphone, une rangée qui défile plutôt qu'une rangée qui
              déborde : avec l'entrée d'administration, cinq liens ne tiennent
              pas dans 390 px, et la page entière glissait de côté. */}
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
            {entrees.map((item) => {
              const isActive = item.id === active;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    // `aria-current` is what tells a screen reader which
                    // page this is; the gold pill says it to everyone else.
                    aria-current={isActive ? 'page' : undefined}
                    className={`block whitespace-nowrap rounded-xl px-4 py-2.5 text-sm transition-colors ${
                      clair
                        ? isActive
                          ? 'bg-console-fond font-semibold text-wine'
                          : 'text-ink/65 hover:bg-console-fond hover:text-ink'
                        : isActive
                          ? 'bg-plum-card font-semibold text-gold'
                          : 'text-cream/70 hover:bg-plum-card/60 hover:text-cream'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <main className="relative min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
        <div className={`mx-auto w-full lg:mx-0 ${large ? 'max-w-7xl' : 'max-w-3xl xl:max-w-4xl'}`}>
          {children}
        </div>
      </main>
    </div>
  );
}
