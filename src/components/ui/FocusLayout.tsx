// The single-column shell: one screen, one task, nothing beside it.
//
// Used by the game and by the short account screens. This is NOT a lesser
// version of `AuthSplitLayout` — it is the right layout for a different
// job. During a game the phone is passed between two people and the screen
// holds one question; a marketing panel next to it would compete with the
// only thing on screen that matters, and on the reveal screens it would
// push the answers below the fold.
//
// Its value is that the pages using it no longer each re-declare their own
// root. That was not true until now: this component existed but NO page
// imported it, while twenty-two hand-written `<main>` roots carried
// near-identical class strings that had already drifted — four different
// gaps, two different paddings, and one screen centring its text where its
// sibling did not. The comment here used to claim fourteen pages used it.
// They did not. They do now.
//
// ── The desktop pass ──────────────────────────────────────────────────
// The column stays `max-w-md` at every size, deliberately: two people read
// this screen over one phone, and a layout that reflowed into columns on a
// laptop would be a different game, not a wider one. What DID need fixing
// is that a 448px column of text on 1500px of flat ink reads as a phone
// screenshot pasted onto a black page. So the column gets a surface at
// `lg` — the same card treatment the auth form column gets — and the page
// gets the shared ambient ground. Below `lg` nothing changes: the mobile
// layout was already right, which is exactly what the user reported.
//
// ── Grounds ───────────────────────────────────────────────────────────
// The mobile canvas gives two of the twelve screens a ground that is not
// ink, and in both cases the colour IS the message: the Scénarios round
// runs on cream so the change of chapter is felt rather than read, and the
// hand-over screen fills with wine so nobody misses that the phone is
// changing hands. Those are the only two, and they are enumerated here
// rather than passed as free-form classes — a shell that accepts arbitrary
// colours is how a design system acquires a fourth background nobody
// approved.
import type { ReactNode } from 'react';
import { AmbientBackdrop } from '@/components/ui/AmbientBackdrop';

export type FocusGround = 'ink' | 'cream' | 'wine';

const GROUND: Record<FocusGround, { root: string; card: string; backdrop: boolean }> = {
  ink: {
    root: 'bg-ink text-cream',
    card: 'lg:rounded-3xl lg:border lg:border-cream/10 lg:bg-plum-card/40 lg:p-9 lg:shadow-[0_30px_70px_-40px_rgba(0,0,0,0.95)]',
    backdrop: true,
  },
  cream: {
    root: 'bg-cream text-plum-deep',
    card: 'lg:rounded-3xl lg:border lg:border-plum-deep/10 lg:bg-white/70 lg:p-9 lg:shadow-[0_30px_70px_-45px_rgba(36,17,41,0.45)]',
    // The ambient gradients are two washes of rose and gold tuned for a
    // near-black page. On cream they read as smudges.
    backdrop: false,
  },
  wine: {
    // Flat and undecorated on purpose: this ground exists to be noticed as
    // a whole-screen colour change, and a card drawn on top of it would
    // divide the very field that carries the message.
    root: 'bg-wine text-cream',
    card: '',
    backdrop: false,
  },
};

interface FocusLayoutProps {
  children: ReactNode;
  /**
   * `center` for a short screen that reads as a single statement (a
   * confirmation, a prompt, an error). `top` for content that can grow
   * past the viewport — a list of answers, a results breakdown — where
   * centring would push the start of it off-screen.
   */
  align?: 'center' | 'top';
  /**
   * Centre the text as well. Right for confirmations, wrong for forms.
   *
   * It also centres the children horizontally, and that pairing is not
   * incidental: every hand-written root this replaced carried `text-center`
   * and `items-center` together or neither. Splitting them into two props
   * would let a caller pick the combination none of the screens use, and
   * dropping `items-center` would silently stretch each centred screen's
   * pill button to the full column width.
   */
  centerText?: boolean;
  /** See the Grounds note above. Defaults to the app's ink. */
  ground?: FocusGround;
}

export function FocusLayout({
  children,
  align = 'center',
  centerText = false,
  ground = 'ink',
}: FocusLayoutProps) {
  const tone = GROUND[ground];

  return (
    <main
      className={`relative flex min-h-screen flex-col items-center px-6 font-grotesk ${tone.root} ${
        align === 'center' ? 'justify-center py-10' : 'py-8'
      }`}
    >
      {tone.backdrop && <AmbientBackdrop />}

      {/*
        `flex-1` on the top-aligned variant is load-bearing, not cosmetic.
        Several screens push their primary action to the bottom edge with
        `mt-auto`; that only works while the flex column actually fills the
        viewport. Without it the CTA would silently ride up under the
        content on every short screen — a layout regression with no error
        and no failing test to announce it.

        `relative` lifts the column above the backdrop. The surface is
        `lg:` only: on a phone the column already fills the screen, and a
        card drawn around something that has nothing beside it is just an
        extra outline.
      */}
      <div
        className={`relative flex w-full max-w-md flex-col gap-6 ${tone.card} ${
          align === 'top' ? 'flex-1' : ''
        } ${centerText ? 'items-center text-center' : ''}`}
      >
        {children}
      </div>
    </main>
  );
}
