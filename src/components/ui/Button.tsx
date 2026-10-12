// The platform's one button.
//
// Before this, the same call-to-action existed as 32 hand-written class
// strings across the app, and they had already drifted: the auth screens
// used `bg-gold`, the game screens `bg-wine`, and the disabled and hover
// treatments differed from one screen to the next. A single primary action
// colour is what "the same design" means in practice.
//
// `primary` is GOLD — the action colour of the design canvas. The game
// screens were the outlier and now match. Wine keeps its two real jobs:
// the brand mark and error text.
//
// The marketing landing page deliberately does NOT use this: its hero CTA
// is a wine-on-ink treatment belonging to that page's own approved design,
// and unifying it here would redesign a screen nobody asked to change.
import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

// `inverse` is not a fourth call-to-action: it is `primary` on a ground
// that is not ink. The Scénarios round is played on cream (see
// `lib/game/round-ground.ts`) and gold-on-cream fails contrast, so the fill
// and the label swap. Any screen on a light ground uses this, and no
// screen picks it by taste — `groundChrome().ctaVariant` decides.
export type ButtonVariant = 'primary' | 'inverse' | 'secondary' | 'secondary-inverse' | 'ghost';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-gold text-ink hover:bg-cream',
  inverse: 'bg-plum-deep text-cream hover:bg-wine',
  secondary: 'border border-cream/26 text-cream hover:border-gold',
  'secondary-inverse': 'border border-plum-deep/26 text-plum-deep hover:border-wine',
  ghost: 'text-cream/70 underline underline-offset-4 hover:text-gold',
};

// `py-4` on a 15px line keeps every button past the 48px touch target a
// thumb needs; `ghost` is inline text and is exempt.
const SIZE: Record<ButtonVariant, string> = {
  primary: 'rounded-full px-6 py-4 text-[15px] font-bold',
  inverse: 'rounded-full px-6 py-4 text-[15px] font-bold',
  secondary: 'rounded-full px-6 py-4 text-[15px] font-semibold',
  'secondary-inverse': 'rounded-full px-6 py-4 text-[15px] font-semibold',
  ghost: 'text-xs font-semibold',
};

const BASE =
  'inline-flex items-center justify-center text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-50';

function classesFor(variant: ButtonVariant, fullWidth: boolean): string {
  return `${BASE} ${SIZE[variant]} ${VARIANT[variant]} ${fullWidth ? 'w-full' : ''}`;
}

/**
 * The same classes, for the handful of places that must stay a raw
 * `<button>` or `<a>`: an external link (which `ButtonLink` would route
 * internally), and the game screens, whose JSX predates this component.
 *
 * Exported rather than duplicated so there is exactly one definition of
 * what a button looks like. Prefer `<Button>` in new code — this exists to
 * keep the older call sites from drifting, not to replace the component.
 */
export function buttonClass(variant: ButtonVariant = 'primary', fullWidth = false): string {
  return classesFor(variant, fullWidth);
}

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  fullWidth = false,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button {...rest} type={type} className={classesFor(variant, fullWidth)}>
      {children}
    </button>
  );
}

/**
 * The same shape as a link. A separate component rather than a `as` prop:
 * navigation must be an anchor so it opens in a new tab, is announced as a
 * link, and works with the keyboard — a `<button onClick={router.push}>`
 * silently loses all three.
 */
export function ButtonLink({
  href,
  variant = 'primary',
  fullWidth = false,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  fullWidth?: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={classesFor(variant, fullWidth)}>
      {children}
    </Link>
  );
}
