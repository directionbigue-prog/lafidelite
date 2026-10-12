// The brand panel for the screens between "account created" and "playing":
// email verification, then creating or joining an Espace Couple.
//
// It reuses the canvas's numbered-steps idiom, but marks WHICH step the
// visitor is on rather than repeating a static pitch. These screens are the
// ones where someone wonders whether they are nearly done — the pairing
// flow spans four URLs and a wait on someone else — so the panel answers
// that instead of re-selling a product they have already signed up for.
import { AsideShell } from './AsideShell';

export type OnboardingStep = 'verify' | 'pair' | 'ready';

const STEPS: { id: OnboardingStep; num: string; title: string; body: string }[] = [
  {
    id: 'verify',
    num: '01',
    title: 'Vous confirmez votre email',
    body: 'Un code à saisir une seule fois.',
  },
  {
    id: 'pair',
    num: '02',
    title: 'Vous reliez vos deux comptes',
    body: 'Un lien à envoyer, ou un code à six chiffres.',
  },
  {
    id: 'ready',
    num: '03',
    title: 'Vous jouez les 15 questions',
    body: 'Trois manches, un score commun, aucun perdant.',
  },
];

export function OnboardingAside({
  current,
  title,
  intro,
}: {
  current: OnboardingStep;
  title: string;
  intro: string;
}) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);

  return (
    <AsideShell>
      <div>
        <h2 className="text-balance font-serif text-[clamp(28px,4.2vw,42px)] font-normal leading-[1.05] tracking-[-0.01em]">
          {title}
        </h2>
        <p className="mt-4 max-w-[30em] text-pretty text-[15px] leading-[1.55] text-cream/70">
          {intro}
        </p>
      </div>

      <ol className="flex flex-col gap-4">
        {STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li
              key={step.id}
              // `aria-current` is what tells a screen reader which step the
              // person is on; the colour alone conveys it to nobody using one.
              aria-current={active ? 'step' : undefined}
              className={`flex gap-4 border-t pt-4 ${active ? 'border-rose/40' : 'border-cream/12'}`}
            >
              <span
                className={`pt-0.5 text-sm tabular-nums ${
                  active ? 'text-rose' : done ? 'text-cream/50' : 'text-cream/30'
                }`}
              >
                {done ? '✓' : step.num}
              </span>
              <span>
                <span
                  className={`block text-[15px] font-semibold ${
                    active ? 'text-cream' : 'text-cream/55'
                  }`}
                >
                  {step.title}
                </span>
                {active && (
                  <span className="mt-1 block text-sm leading-[1.5] text-cream/60">
                    {step.body}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </AsideShell>
  );
}
