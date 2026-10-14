// The message cards from the canvas's "États & messages" board.
//
// `role` is derived from the tone, not passed in: an error must be
// announced assertively (`role="alert"`) while a confirmation must not
// interrupt whatever the user is doing (`role="status"`). Leaving that to
// each call site is how half of them end up silent to a screen reader.
//
// `surface="clair"` exists for one screen only: the admin console, which
// runs on a light grey ground since 2026-10-14. The default tones write in
// `text-cream` and are invisible on a light surface — that is exactly what
// happened to every Salon error message (see `app/salon/charte.test.ts`).
// The product itself stays dark: do not reach for this variant elsewhere.
import type { ReactNode } from 'react';

export type AlertTone = 'error' | 'success' | 'info';
export type AlertSurface = 'sombre' | 'clair';

const TONE_CLASS: Record<AlertSurface, Record<AlertTone, string>> = {
  sombre: {
    error: 'border-wine/60 bg-wine/10 text-cream',
    success: 'border-gold/50 bg-gold/10 text-cream',
    info: 'border-cream/16 bg-plum-card text-cream/80',
  },
  clair: {
    error: 'border-wine/40 bg-wine/5 text-wine-deep',
    success: 'border-gold-deep/40 bg-gold/15 text-ink',
    info: 'border-console-ligne bg-white text-ink/80',
  },
};

export function Alert({
  tone,
  surface = 'sombre',
  children,
}: {
  tone: AlertTone;
  surface?: AlertSurface;
  children: ReactNode;
}) {
  // A `div`, not a `p`: the admin dashboard passes a `<ul>` of alerts, and a
  // list inside a paragraph is invalid HTML that React reports as a
  // hydration error.
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${TONE_CLASS[surface][tone]}`}
    >
      {children}
    </div>
  );
}
