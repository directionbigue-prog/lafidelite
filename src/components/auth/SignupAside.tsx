// The left-hand brand panel of the signup artboard: badge, headline, the
// three numbered steps, and the couple-score card.
//
// Everything here is static marketing copy. The score card shows the
// canvas's example figure — it is an illustration of what the product
// returns, NOT a value read from anywhere, which is why nothing on this
// screen fetches it. Labelling it as an example in the markup would clutter
// the design; saying so here is what stops a later reader wiring it to a
// real endpoint that does not exist.
import { AsideShell } from './AsideShell';

const STEPS = [
  {
    num: '01',
    title: 'Vous créez votre compte',
    body: 'Prénom, email, mot de passe. Trente secondes.',
  },
  {
    num: '02',
    title: 'Vous invitez votre partenaire',
    body: 'Un lien à envoyer, ou un code à six chiffres.',
  },
  {
    num: '03',
    title: 'Vous jouez les 15 questions',
    body: 'Trois manches, un score commun, aucun perdant.',
  },
];

/** The canvas's example score — illustrative, never fetched. */
const EXAMPLE_SCORE = 248;
const EXAMPLE_LEVEL = 'Complices';

export function SignupAside() {
  return (
    <AsideShell>
      <div>
        <span className="inline-flex items-center gap-2 rounded-full border border-rose/34 px-3.5 py-1.5 text-[11px] uppercase tracking-[0.09em] text-rose">
          <span className="h-1.5 w-1.5 rounded-full bg-rose" />
          Essai gratuit · 15 questions · 12 minutes
        </span>
        <h2 className="mt-5 text-balance font-serif text-[clamp(30px,4.2vw,42px)] font-normal leading-[1.04] tracking-[-0.01em]">
          Un compte,
          <br />
          puis votre <em className="not-italic text-rose">Espace Couple.</em>
        </h2>
        <p className="mt-4 max-w-[30em] text-pretty text-[15px] leading-[1.55] text-cream/70">
          Le compte est personnel : chacun le sien, chacun son téléphone. Vous les reliez juste
          après, en une invitation.
        </p>
      </div>

      <ol className="flex flex-col gap-4">
        {STEPS.map((step) => (
          <li key={step.num} className="flex gap-4 border-t border-cream/12 pt-4">
            <span className="pt-0.5 text-sm tabular-nums text-rose">{step.num}</span>
            <span>
              <span className="block text-[15px] font-semibold">{step.title}</span>
              <span className="mt-1 block text-sm leading-[1.5] text-cream/60">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border border-cream/14 bg-ink/50 p-5">
        <div className="flex items-baseline gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-cream/50">Score du couple</p>
            <p className="mt-1 font-serif text-4xl leading-none text-rose">{EXAMPLE_SCORE}</p>
          </div>
          <p className="text-sm text-cream/68">Niveau : {EXAMPLE_LEVEL}</p>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-cream/50">
          Un seul score, le vôtre. Jamais l’un contre l’autre.
        </p>
      </div>
    </AsideShell>
  );
}
