'use client';

// A labelled form field — the shape every input on the signup canvas uses:
// label, control, optional helper line, optional error line.
//
// The error replaces the helper rather than stacking under it: the canvas
// shows one line of assistance per field, and two competing lines is how a
// form starts pushing its own button off a small screen.
//
// Accessibility is the reason this is a component rather than repeated
// markup. Each field wires `htmlFor`/`id` and points `aria-describedby` at
// whichever line is showing, so a screen reader announces the error with
// the field instead of stranding it as loose text.
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {
  label: string;
  helper?: string;
  error?: string | null;
  /** Rendered inside the control, right-aligned — e.g. the password toggle. */
  trailing?: ReactNode;
  /** Rendered under the control, above the helper — e.g. the strength meter. */
  below?: ReactNode;
  /**
   * `clair` only for the admin console's light grey ground (see `Alert`).
   * The default dark field is invisible there: cream text on a light page.
   */
  surface?: 'sombre' | 'clair';
}

const SURFACE = {
  sombre: {
    input: 'bg-plum-card2 text-cream placeholder:text-cream/30',
    bord: 'border-cream/20 focus:border-gold',
    label: 'text-cream/80',
    helper: 'text-cream/50',
  },
  clair: {
    input: 'bg-white text-ink placeholder:text-ink/35',
    bord: 'border-console-ligne focus:border-gold-deep',
    label: 'text-ink/75',
    helper: 'text-ink/55',
  },
} as const;

const INPUT_BASE = 'w-full rounded-xl border px-4 py-3.5 outline-none transition-colors';

export function Field({
  label,
  helper,
  error,
  trailing,
  below,
  surface = 'sombre',
  ...input
}: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : helper ? `${id}-helper` : undefined;
  const s = SURFACE[surface];

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={`text-sm ${s.label}`}>
        {label}
      </label>

      <div className="relative">
        <input
          {...input}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${INPUT_BASE} ${s.input} ${
            error ? 'border-wine focus:border-wine' : s.bord
          } ${trailing ? 'pr-12' : ''}`}
        />
        {trailing && <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>}
      </div>

      {below}

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-wine">
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className={`text-xs ${s.helper}`}>
          {helper}
        </p>
      ) : null}
    </div>
  );
}
