// The message cards from the canvas's "États & messages" board.
//
// `role` is derived from the tone, not passed in: an error must be
// announced assertively (`role="alert"`) while a confirmation must not
// interrupt whatever the user is doing (`role="status"`). Leaving that to
// each call site is how half of them end up silent to a screen reader.
import type { ReactNode } from 'react';

export type AlertTone = 'error' | 'success' | 'info';

const TONE_CLASS: Record<AlertTone, string> = {
  error: 'border-wine/60 bg-wine/10 text-cream',
  success: 'border-gold/50 bg-gold/10 text-cream',
  info: 'border-cream/16 bg-plum-card text-cream/80',
};

export function Alert({ tone, children }: { tone: AlertTone; children: ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${TONE_CLASS[tone]}`}
    >
      {children}
    </p>
  );
}
