// The brand panel's shell: the gradient card and the Cœur Fidèle lockup.
//
// It exists because three panels — signup, sign-in, onboarding — were
// carrying a byte-identical 12-class wrapper string and a byte-identical
// brand link. That is the exact shape of the drift this codebase keeps
// getting bitten by: each copy is locally correct, and the day one of them
// gains a border or loses a padding step, nothing fails and nobody sees it
// until two screens are side by side in a screenshot.
//
// So the panel is defined once. Each aside now supplies only its own
// content, which is the only thing that actually differs between them.
import type { ReactNode } from 'react';
import Link from 'next/link';

export function AsideShell({ children }: { children: ReactNode }) {
  return (
    <div
      // `lg:gap-6 lg:p-9` rather than the `gap-7 lg:p-10` this used to
      // carry: on a 1280×800 window the panel overflowed the viewport and
      // the card at its foot was cut in half. Tightening the desktop rhythm
      // by one step is what lets the whole composition be centred instead
      // of merely starting at the top and running off the bottom.
      // No `h-full`: the panel is sized by its own content and centred by
      // `AuthSplitLayout` (see the note there). A leftover `h-full` would be
      // a no-op that reads as if the panel still stretched.
      className="relative flex flex-col gap-7 overflow-hidden rounded-3xl border border-cream/10 bg-gradient-to-br from-plum to-plum-deep2 p-6 shadow-[0_30px_70px_-40px_rgba(0,0,0,0.95)] sm:p-8 lg:gap-6 lg:p-8"
    >
      {/*
        A one-pixel sheen along the top edge. It is what stops a large flat
        gradient from reading as a coloured rectangle: on a wide screen the
        panel is big enough that the eye wants an edge to catch.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cream/25 to-transparent"
      />

      <Link href="/" className="flex items-center gap-2.5 self-start">
        <span className="h-2.5 w-2.5 rounded-full bg-wine shadow-[0_0_0_4px_rgba(139,44,86,.16)]" />
        <span className="font-serif text-xl tracking-[0.01em]">Cœur Fidèle</span>
      </Link>

      {children}
    </div>
  );
}
