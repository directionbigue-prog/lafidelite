'use client';

// /jeu/[id]/resultats — the final screen a couple sees together once a
// game reaches `COMPLETE` (Lot 2, Task 22).
//
// Why the `[id]` route param IS trusted here, unlike every other `/jeu/*`
// screen in this lot: `GET /api/games/current` resolves the couple's
// IN_PROGRESS session and 404s once the game is `COMPLETED` — there is no
// "current" session left to resolve once this screen is reachable. The
// only correct source for which game's results to show is therefore the id
// the couple already navigated here WITH: either `round/advance`'s response
// via `nextPathAfterAdvance` (`round-reveal.ts`), which used the id
// `GET /api/games/current` returned moments earlier, or a couple returning
// to a link/bookmark for a game they own. Earlier `/jeu/*` screens avoided
// the route param because a stale tab could resume an in-progress session
// under a since-replaced id; a COMPLETED game has no "resume" path to get
// wrong, and `GET /api/games/:id/results` re-checks ownership + COMPLETED
// status server-side regardless (see that route's Design Decision 5) — a
// bookmarked id for someone else's game, or one that never finished, gets
// the same 404 either way.
//
// All decision logic (the French complicity-level label, the masked-vs-
// unmasked branch, and — most importantly — the fixed DOM order the
// product requires: coupleScore, then complicityLevel, then individual
// scores/masked message, then titles, then conversation prompts) lives in
// `@/lib/game/resultats`'s `buildResultsSections`, per this lot's no-jsdom
// testing decision. This component renders that array with a single
// `.map()` so the order the pure function's tests pin IS the DOM order.
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { gameErrorMessage } from '@/lib/game/api-result';
import {
  buildResultsSections,
  resultsColumnLabels,
  type GameResultsResponse,
  type ResultsSection,
} from '@/lib/game/resultats';
import { buttonClass } from '@/components/ui/Button';
import { nouveauxBadges, type EtatBadge } from '@/lib/rituel/badges';
import type { EtatSerie } from '@/lib/rituel/serie';
import { joursLibelle } from '@/lib/rituel/ecran';
import { FocusLayout } from '@/components/ui/FocusLayout';

interface CoupleMeResponse {
  couple: {
    status: string;
    partnerName: string | null;
    viewerRole?: string;
  } | null;
}

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'ready'; sections: ResultsSection[] }
  | { kind: 'error'; message: string };

const CTA_CLASS = buttonClass('primary');

const SECONDARY_CTA_CLASS = buttonClass('ghost');

export default function ResultatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useUser('/connexion');
  const router = useRouter();

  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  // Finir chaque partie sur une victoire : les badges débloqués aujourd'hui
  // et la flamme. Chargé à part et jamais attendu — un échec ici retire le
  // bandeau, jamais le résultat.
  const [fete, setFete] = useState<{ nouveaux: EtatBadge[]; serie: EtatSerie } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api<{ aujourdhui: string; serie: EtatSerie; badges: EtatBadge[] }>('/api/rituel')
      .then((p) => {
        if (!cancelled)
          setFete({ nouveaux: nouveauxBadges(p.badges, p.aujourdhui), serie: p.serie });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void (async () => {
      try {
        // `allSettled`, not `all`: the couple lookup only supplies the two
        // column LABELS. A hiccup there must not cost the couple their
        // whole result screen — the one thing the entire game builds to.
        // The results fetch is load-bearing and still fails the screen.
        const [resultsSettled, meSettled] = await Promise.allSettled([
          api<GameResultsResponse>(`/api/games/${encodeURIComponent(id)}/results`),
          api<CoupleMeResponse>('/api/couples/me'),
        ]);
        if (cancelled) return;
        if (resultsSettled.status === 'rejected') throw resultsSettled.reason;
        const results = resultsSettled.value;
        const me: CoupleMeResponse =
          meSettled.status === 'fulfilled' ? meSettled.value : { couple: null };

        const columnLabels = resultsColumnLabels(
          me.couple?.viewerRole ?? '',
          me.couple?.partnerName ?? null,
        );
        setState({ kind: 'ready', sections: buildResultsSections(results, columnLabels) });
      } catch (err) {
        if (!cancelled) setState({ kind: 'error', message: gameErrorMessage(err) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, id]);

  if (!user) return null;

  if (state.kind === 'loading') {
    return (
      <FocusLayout centerText>
        <p role="status" className="text-sm text-cream/60">
          Chargement…
        </p>
      </FocusLayout>
    );
  }

  if (state.kind === 'error') {
    return (
      <FocusLayout centerText>
        <p role="alert" className="text-sm text-rose">
          {state.message}
        </p>
        <button type="button" onClick={() => router.push('/jeu')} className={CTA_CLASS}>
          Retour à l’accueil du jeu
        </button>
      </FocusLayout>
    );
  }

  return (
    <FocusLayout align="top">
      {/*
        No headline above the score. The canvas leads with the number
        itself, and it is right: the couple already knows the game is over
        — what they came for is the figure, and a title above it only
        delays the one thing on the screen.
      */}
      <h1 className="sr-only">Résultat de la partie</h1>

      <div className="flex flex-col gap-6">
        {state.sections.map((section) => (
          <ResultsSectionView key={section.kind} section={section} />
        ))}
      </div>

      {/*
        After the result, never inside it: the result's section order is
        fixed by `buildResultsSections`, and this banner is not part of the
        game's score — it is the ritual's (badges, streak), sealed apart.
      */}
      {fete && (fete.nouveaux.length > 0 || fete.serie.actuelle > 0) && (
        <section className="rounded-2xl border border-gold/40 bg-plum-card p-5 text-center">
          {fete.nouveaux.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-[0.14em] text-gold">
                {fete.nouveaux.length > 1 ? 'Nouveaux badges débloqués' : 'Nouveau badge débloqué'}
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {fete.nouveaux.map((b) => (
                  <li key={b.id}>
                    <span className="font-serif text-xl text-cream">{b.titre}</span>
                    <span className="block text-sm text-cream/60">{b.description}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {fete.serie.actuelle > 0 && (
            <p className={`text-sm text-cream/70 ${fete.nouveaux.length > 0 ? 'mt-3' : ''}`}>
              Flamme :{' '}
              <span className="font-semibold text-gold">{joursLibelle(fete.serie.actuelle)}</span>{' '}
              d’affilée.
            </p>
          )}
        </section>
      )}

      <div className="mt-auto flex flex-col items-center gap-3 pt-4">
        <button type="button" onClick={() => router.push('/jeu')} className={CTA_CLASS}>
          Rejouer
        </button>
        <button type="button" onClick={() => router.push('/')} className={SECONDARY_CTA_CLASS}>
          Retour à l’accueil
        </button>
      </div>
    </FocusLayout>
  );
}

function ResultsSectionView({ section }: { section: ResultsSection }) {
  switch (section.kind) {
    case 'coupleScore':
      return (
        /*
          This card used to read "Votre score de couple" above a bare
          number, and on a real game that number was 20 while each partner
          showed 59 — which reads as a bug. It is not one: the two figures
          count different things. `coupleScore` is the Face-à-face round's
          shared answers, and it is the ONLY figure that survives the game
          — `POST /round/advance` increments `Couple.cumulativeCoupleScore`
          by exactly this, and the complicity level is derived from that
          total. The individual scores are the evening's tally and are
          never added to anything.

          So the screen says what the number is instead of restating the
          formula: a GAIN, written with its sign, over the round it comes
          from. The "+" is doing real work — it stops a per-game increment
          from being read as a total sitting below two larger ones.
        */
        <section className="rounded-3xl border border-cream/10 bg-gradient-to-b from-plum to-plum-deep p-8 text-center">
          <p className="text-[11px] uppercase tracking-[0.22em] text-cream/55">
            Votre accord ce soir
          </p>
          <p className="mt-3 font-serif text-[64px] leading-none text-gold">
            +{section.coupleScore}
          </p>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-cream/60">
            Vos réponses communes en Face à face. C’est le seul score qui s’ajoute à celui de votre
            couple.
          </p>
        </section>
      );

    case 'complicityLevel':
      return (
        <section className="text-center">
          {/*
            A chip rather than a sentence: the level is a standing, and the
            canvas gives it the shape of a badge you would show someone.
          */}
          <span className="inline-flex rounded-full border border-gold/40 bg-gold/12 px-4 py-1.5 text-sm font-semibold text-gold">
            Niveau {section.label}
          </span>
        </section>
      );

    case 'individualScores':
      return (
        <section>
          {section.masked ? (
            <div className="rounded-2xl bg-plum-card2 p-5 text-center">
              <p className="text-sm leading-relaxed text-cream/80">{section.message}</p>
            </div>
          ) : (
            /*
              Framed as the evening's tally, explicitly, so it cannot be
              read as a rival to the card above. The note is the whole
              point of this block: without it, two numbers larger than the
              couple's make the couple's look like the mistake.

              The masked branch keeps no heading — there are no scores
              under it to introduce.
            */
            <>
              <h2 className="text-[10px] uppercase tracking-[0.14em] text-cream/50">
                Ce soir, chacun
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <ScoreCell label={section.creatorLabel} score={section.creatorScore} />
                <ScoreCell label={section.partnerLabel} score={section.partnerScore} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-cream/50">
                Ces points comptent pour la partie, pas pour votre niveau.
              </p>
            </>
          )}
        </section>
      );

    case 'titles':
      return (
        /*
          One line each, not a second pair of cards. The titles used to
          repeat the same two name labels the score cells directly above
          already carry — "TOI / MOUSSA" printed twice in a row, which
          reads as a rendering fault rather than as two facts.

          The sections stay separate — their ORDER is a product
          requirement pinned by `resultats.test.ts`, and merging them
          would change the model, not just the look.
        */
        <section className="grid grid-cols-2 gap-3">
          <TitleLine label={section.creatorLabel} title={section.creatorTitle} />
          <TitleLine label={section.partnerLabel} title={section.partnerTitle} />
        </section>
      );

    case 'conversationPrompts':
      return (
        <section className="rounded-2xl bg-plum-card p-5">
          <h2 className="font-serif text-xl">3 choses à vous dire ce soir</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {section.prompts.map((prompt, index) => (
              <li
                key={index}
                className="rounded-xl bg-plum-card2 px-4 py-3 text-sm leading-relaxed text-cream/90"
              >
                {prompt}
              </li>
            ))}
          </ul>
        </section>
      );
  }
}

function ScoreCell({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-2xl border border-cream/10 bg-plum-card px-3 py-4 text-center">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-cream/50">
        {label}
      </p>
      <p className="mt-1 font-serif text-3xl text-cream">{score}</p>
    </div>
  );
}

function TitleLine({ label, title }: { label: string; title: string }) {
  return (
    <p className="text-center text-sm">
      <span className="text-cream/50">{label} · </span>
      <span className="font-bold text-gold">{title}</span>
    </p>
  );
}
