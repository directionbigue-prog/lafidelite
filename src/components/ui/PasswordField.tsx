'use client';

// The password field from the canvas: a `Field` plus a show/hide toggle and
// the four-segment strength meter underneath.
//
// The meter is advisory. It never disables the submit button — the server
// is the authority on what it accepts, and a client-side gate would only
// mean a user who types something the server WOULD have taken cannot send
// it. See `lib/auth/password-strength.ts`.
import { useState } from 'react';
import { Field } from './Field';
import {
  passwordStrength,
  PASSWORD_MIN_LENGTH,
  STRENGTH_SEGMENTS,
} from '@/lib/auth/password-strength';

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  autoComplete?: string;
  helper?: string;
}

// One class per level rather than an index into an array: an out-of-range
// score then cannot silently paint the wrong colour.
const SEGMENT_COLOR: Record<string, string> = {
  faible: 'bg-wine',
  moyen: 'bg-gold-deep',
  bon: 'bg-gold',
  solide: 'bg-rose',
};

export function PasswordField({
  label,
  value,
  onChange,
  error,
  autoComplete = 'new-password',
  helper = `Au moins ${PASSWORD_MIN_LENGTH} caractères. Mélangez majuscules, chiffres et symboles.`,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(value);

  return (
    <Field
      label={label}
      type={visible ? 'text' : 'password'}
      required
      minLength={PASSWORD_MIN_LENGTH}
      autoComplete={autoComplete}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error ?? null}
      helper={helper}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // The control is icon-free text, so the label IS the accessible
          // name; `aria-pressed` conveys the toggle state.
          aria-pressed={visible}
          className="rounded-lg px-3 py-2 text-xs font-semibold text-cream/60 transition-colors hover:text-gold"
        >
          {visible ? 'Masquer' : 'Voir'}
        </button>
      }
      below={
        strength.label !== null && (
          <div className="mt-1 flex items-center gap-3">
            <div className="flex flex-1 gap-1.5" aria-hidden>
              {Array.from({ length: STRENGTH_SEGMENTS }, (_, i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i < strength.score
                      ? (SEGMENT_COLOR[strength.level] ?? 'bg-cream/20')
                      : 'bg-cream/12'
                  }`}
                />
              ))}
            </div>
            {/*
              The bar itself is decorative; this line carries the meaning,
              and `role="status"` announces a change of level without
              stealing focus mid-typing.
            */}
            <span role="status" className="w-14 shrink-0 text-right text-xs text-cream/60">
              {strength.label}
            </span>
          </div>
        )
      }
    />
  );
}
