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
}

const INPUT_BASE =
  'w-full rounded-xl border bg-plum-card2 px-4 py-3.5 text-cream outline-none transition-colors placeholder:text-cream/30';

export function Field({ label, helper, error, trailing, below, ...input }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : helper ? `${id}-helper` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-cream/80">
        {label}
      </label>

      <div className="relative">
        <input
          {...input}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${INPUT_BASE} ${
            error ? 'border-wine focus:border-wine' : 'border-cream/20 focus:border-gold'
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
        <p id={`${id}-helper`} className="text-xs text-cream/50">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
