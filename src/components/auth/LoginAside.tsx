// The brand panel for /connexion — the same shell as signup's, with the
// copy a returning couple needs rather than the three onboarding steps.
//
// Someone signing in has already been through "create an account, invite,
// play". Repeating those steps here would be explaining the product to a
// person who has used it. What they may need instead is the reminder that
// pass-and-play means one signed-in phone, not two — the single question
// this screen actually gets asked.
import { AsideShell } from './AsideShell';

export function LoginAside() {
  return (
    <AsideShell>
      <div>
        <span className="inline-flex items-center gap-2 rounded-full border border-rose/34 px-3.5 py-1.5 text-[11px] uppercase tracking-[0.09em] text-rose">
          <span className="h-1.5 w-1.5 rounded-full bg-rose" />
          Reprenez où vous en étiez
        </span>
        <h2 className="mt-5 text-balance font-serif text-[clamp(30px,4.2vw,42px)] font-normal leading-[1.04] tracking-[-0.01em]">
          Content de vous
          <br />
          <em className="not-italic text-rose">revoir.</em>
        </h2>
        <p className="mt-4 max-w-[30em] text-pretty text-[15px] leading-[1.55] text-cream/70">
          Une partie en cours reprend là où vous l’aviez laissée, à la bonne manche et à la bonne
          question.
        </p>
      </div>

      <div className="rounded-2xl border border-cream/14 bg-ink/50 p-5">
        <p className="text-[10px] uppercase tracking-[0.14em] text-cream/50">
          Côte à côte ou à distance
        </p>
        <p className="mt-2 text-sm leading-relaxed text-cream/70">
          Ensemble, une seule personne se connecte et vous vous passez l’appareil. Loin l’un de
          l’autre, connectez-vous chacun sur votre téléphone et lancez l’appel vidéo.
        </p>
      </div>
    </AsideShell>
  );
}
