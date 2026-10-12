// The two-column auth shell from the canvas: a brand panel and a form.
//
// Mobile-first, and the DOM order is the point. The form comes FIRST in the
// markup because on a phone it is the task; the brand panel is the argument
// for doing it, and a visitor who already tapped "Créer mon compte" should
// not scroll past three explanatory steps to reach the fields. On `lg` the
// panel moves back to the left with `lg:order-first`, matching the desktop
// artboard, without reordering the document for a screen reader or for
// tab order — CSS order does not move focus, so the form stays first for
// the keyboard too, which is what we want on every size.
//
// ── What the desktop pass changed, and why ────────────────────────────
// The mobile artboard looked finished and the desktop one did not, from
// the same components. Three causes, none of them the design:
//
//   1. The composition was TOP-ALIGNED inside a `min-h-screen` page, so on
//      a 1280×800 window the panel simply ran off the bottom and the score
//      card was cut in half. The grid now claims the viewport height
//      itself (`lg:min-h-screen`, border-box, so its own padding is
//      included) and the columns stretch to it. The panel's `mt-auto`
//      footer lands on the bottom edge instead of past it.
//   2. The form column had NO SURFACE. Next to a filled gradient panel it
//      read as leftover space rather than the other half of a pair — the
//      single biggest reason the desktop felt emptier than the phone,
//      where the form owns the full width and needs no help. It gets a
//      card at `lg` only; mobile keeps the flush layout that already works.
//   3. Nothing sat behind any of it. At 375px the background is barely
//      seen; at 1500px it is most of the screen, and flat ink reads as
//      unfinished. `AmbientBackdrop` is the landing page's own glow idiom,
//      shared.
import type { ReactNode } from 'react';
import { AmbientBackdrop } from '@/components/ui/AmbientBackdrop';

export function AuthSplitLayout({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <main className="relative min-h-screen bg-ink font-grotesk text-cream">
      <AmbientBackdrop />

      {/*
        `relative` so the composition sits above the backdrop; without it
        the glows paint over the form.
      */}
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-8 px-5 py-8 sm:px-8 lg:min-h-screen lg:grid-cols-2 lg:items-stretch lg:gap-12 lg:px-10 lg:py-8 xl:max-w-[74rem] xl:gap-16">
        <section className="w-full lg:order-last lg:flex lg:flex-col lg:justify-center">
          <div className="mx-auto w-full max-w-md lg:max-w-[27.5rem] lg:rounded-3xl lg:border lg:border-cream/10 lg:bg-plum-card/40 lg:p-9 lg:shadow-[0_30px_70px_-40px_rgba(0,0,0,0.95)] xl:p-10">
            {children}
          </div>
        </section>
        {/*
          `lg:self-center`, not the grid's default stretch. Stretching looked
          right on signup, whose panel is nearly viewport-tall anyway, and
          wrong on sign-in, whose panel is half that: the footer card was
          pinned to the bottom edge and left a 250px hole in the middle of a
          gradient. Sizing each panel to its own content and centring it
          means a short panel reads as a balanced pair with the form instead
          of a tall box with a gap in it.
        */}
        <aside className="w-full lg:order-first lg:self-center">{aside}</aside>
      </div>
    </main>
  );
}
