'use client';

// /jeu/[id]/manche-revelee — the between-rounds reveal (Lot 2, Task 21).
// Both partners read this screen TOGETHER once a round finishes: it shows
// what each of them answered and, for MIROIR, whether each one's
// prediction about the OTHER landed.
//
// Boot sequence, same posture as every other `/jeu/*` screen in this lot:
// `GET /api/games/current` (+ `GET /api/couples/me` for the "Toi" / partner-
// name column labels, fetched in parallel — both are read-only and
// independent) is the authority on session id, phase and round number. The
// `[id]` route param is deliberately never read — see `question/page.tsx`'s
// module header, the most recent reviewed example this page is modelled on.
//
// This screen does NOT call `start-turn` or otherwise mutate on mount — it
// only reads `GET /api/games/:id/rounds/:roundNumber` for the round's
// results. The only mutation is the final "Continuer" button, which calls
// `POST /api/games/:id/round/advance`.
//
// Hard product constraint: no score, no points, no percentage, no fidelity
// weight anywhere on this screen — see `round-reveal.ts`'s header comment.
// All decision logic (the diagonal MIROIR match wiring, phase routing,
// column labelling) lives in that pure module per this lot's no-jsdom
// testing decision; this component stays a thin fetch + render wrapper.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { gameErrorMessage } from '@/lib/game/api-result';
import { roundLabel, TOTAL_ROUNDS } from '@/lib/game/round-labels';
import { GameProgressHeader } from '@/components/game/GameProgress';
import { gameProgress } from '@/lib/game/progress';
import {
  revealBootDecision,
  nextPathAfterAdvance,
  buildRevealRows,
  roundVerdict,
  revealColumnLabels,
  type RoundVerdict,
  type QuestionResultEntry,
  type RevealRow,
  type RevealColumnLabels,
} from '@/lib/game/round-reveal';
import { buttonClass } from '@/components/ui/Button';
import { FocusLayout } from '@/components/ui/FocusLayout';

interface CurrentGameSessionResponse {
  id: string;
  phase: string;
  currentRoundNumber: number;
  questionsPerRound: number[];
}

interface CoupleMeResponse {
  couple: {
    status: string;
    partnerName: string | null;
    viewerRole?: string;
  } | null;
}

interface RoundResultsResponse {
  roundNumber: number;
  type: string;
  questions: QuestionResultEntry[];
}

interface AdvanceResponse {
  phase: string;
}

type ScreenState =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      /** From `GET /api/games/current` — NOT the `[id]` route param. */
      sessionId: string;
      roundNumber: number;
      roundTitle: string | null;
      columnLabels: RevealColumnLabels;
      rows: RevealRow[];
      verdict: RoundVerdict;
      questionsPerRound: number[];
    }
  | { kind: 'error'; message: string };

const UNKNOWN_ROUND_MESSAGE = 'Cette manche est dans un état inconnu. Revenez à l’accueil du jeu.';

const CTA_CLASS = buttonClass('primary');

export default function MancheReveleePage() {
  const user = useUser('/connexion');
  const router = useRouter();
  // The `[id]` route param is deliberately NOT read — see the module
  // header. `GET /api/games/current` is the authority on which session is
  // in progress.

  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void (async () => {
      try {
        // `allSettled`, not `all`: the couple lookup only supplies the
        // two column LABELS ("Toi" / the partner's name). Letting a
        // hiccup on that call reject the whole screen would throw away
        // the round's answers — the thing the player actually came for —
        // over a caption. The session fetch is load-bearing and still
        // fails the screen. `revealColumnLabels('')` degrades to neutral
        // French labels, which is a strictly better outcome than an
        // error page.
        const [sessionResult, meResult] = await Promise.allSettled([
          api<CurrentGameSessionResponse>('/api/games/current'),
          api<CoupleMeResponse>('/api/couples/me'),
        ]);
        if (cancelled) return;
        if (sessionResult.status === 'rejected') throw sessionResult.reason;
        const session = sessionResult.value;
        const me: CoupleMeResponse =
          meResult.status === 'fulfilled' ? meResult.value : { couple: null };

        const boot = revealBootDecision(session.id, session.phase);
        if (boot.kind === 'error') {
          setState({ kind: 'error', message: boot.message });
          return;
        }
        if (boot.kind === 'navigate') {
          router.push(boot.path);
          return;
        }

        const label = roundLabel(session.currentRoundNumber);
        if (!label) {
          setState({ kind: 'error', message: UNKNOWN_ROUND_MESSAGE });
          return;
        }

        const round = await api<RoundResultsResponse>(
          `/api/games/${encodeURIComponent(session.id)}/rounds/${session.currentRoundNumber}`,
        );
        if (cancelled) return;

        const rows = buildRevealRows(round.questions, round.type);

        setState({
          kind: 'ready',
          sessionId: session.id,
          roundNumber: session.currentRoundNumber,
          roundTitle: label.title,
          columnLabels: revealColumnLabels(
            me.couple?.viewerRole ?? '',
            me.couple?.partnerName ?? null,
          ),
          rows,
          // The round TYPE comes from the round payload, never from the
          // round number: the number decides the label, the payload is
          // what actually shipped.
          verdict: roundVerdict(rows, round.type),
          questionsPerRound: session.questionsPerRound,
        });
      } catch (err) {
        if (!cancelled) setState({ kind: 'error', message: gameErrorMessage(err) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, router]);

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

  const advance = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await api<AdvanceResponse>(
        `/api/games/${encodeURIComponent(state.sessionId)}/round/advance`,
        { method: 'POST' },
      );
      const outcome = nextPathAfterAdvance(state.sessionId, res.phase);
      if (outcome.kind === 'error') {
        setActionError(outcome.message);
        setBusy(false);
        return;
      }
      router.push(outcome.path);
    } catch (err) {
      setActionError(gameErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <FocusLayout align="top">
      {/*
        The header used to read "Miroir · Manche 1 sur 3" — the round named
        twice in one line. The shared component puts the name on top and
        the position under it, and adds the bar this screen never had.
      */}
      <GameProgressHeader
        progress={gameProgress(
          { kind: 'roundDone', roundNumber: state.roundNumber },
          state.questionsPerRound,
        )}
      />

      {/*
        The canvas opens this screen with a count, not a title — "Vous vous
        êtes compris 4 fois sur 5". It tells the couple something they did
        not know, in their own words, before the detail. "Ce que vous avez
        répondu", which used to sit here, told them where they already were.
      */}
      <div>
        <h1 className="font-serif text-[32px] leading-tight">{state.verdict.headline}</h1>
        <p className="mt-2 text-sm text-cream/65">{state.verdict.subline}</p>
      </div>

      <ul className="flex flex-col gap-4">
        {state.rows.map((row, index) => (
          <li key={row.id} className="rounded-2xl bg-plum-card p-5 text-left">
            {/*
              The questions stay in the order they were played — a couple
              re-reads them as the evening happened. The chip is what
              carries the canvas's "here is where you diverged": it marks
              each row instead of reordering them, so nothing is hidden
              and nothing is renumbered.
            */}
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-gold">
                Question {index + 1}
              </p>
              {row.aligned !== null && (
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${
                    row.aligned ? 'bg-gold/15 text-gold' : 'bg-wine/25 text-rose'
                  }`}
                >
                  {row.aligned ? 'Ensemble' : 'Divergence'}
                </span>
              )}
            </div>
            <h2 className="mt-2 font-serif text-lg leading-snug">{row.prompt}</h2>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <AnswerCell label={state.columnLabels.creatorLabel} answer={row.creatorAnswer} />
              <AnswerCell label={state.columnLabels.partnerLabel} answer={row.partnerAnswer} />
            </div>

            {row.mirror && (
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-cream/10 pt-3">
                <PredictionCell
                  label={`Prédiction de ${state.columnLabels.creatorLabel}`}
                  answer={row.mirror.creatorPrediction}
                  guessedRight={row.mirror.creatorGuessedRight}
                />
                <PredictionCell
                  label={`Prédiction de ${state.columnLabels.partnerLabel}`}
                  answer={row.mirror.partnerPrediction}
                  guessedRight={row.mirror.partnerGuessedRight}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {actionError !== null && (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm text-rose">
            {actionError}
          </p>
          {/*
            Same escape hatch as `/question`'s actionError block: if the
            advance POST commits but its response is lost, the session has
            already moved past ROUND_REVEAL server-side, so a retry now
            409s NOT_IN_ROUND_REVEAL forever. Without this, a reload is the
            only way out.
          */}
          <button
            type="button"
            onClick={() => router.push('/jeu')}
            className="text-xs font-semibold text-cream/70 underline underline-offset-4 transition-colors hover:text-rose"
          >
            Retour à l’accueil du jeu
          </button>
        </div>
      )}

      <div className="mt-auto flex flex-col items-center gap-3 pt-4">
        <button
          type="button"
          onClick={() => void advance()}
          disabled={busy}
          className={buttonClass('primary', true)}
        >
          {state.roundNumber < TOTAL_ROUNDS ? 'Manche suivante' : 'Voir le résultat'}
        </button>
      </div>
    </FocusLayout>
  );
}

function AnswerCell({
  label,
  answer,
}: {
  label: string;
  answer: { text: string; isSkipped: boolean };
}) {
  return (
    <div className="rounded-xl bg-plum-card2 px-3 py-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-cream/50">
        {label}
      </p>
      <p className={`mt-1 text-sm ${answer.isSkipped ? 'italic text-cream/40' : 'text-cream'}`}>
        {answer.text}
      </p>
    </div>
  );
}

function PredictionCell({
  label,
  answer,
  guessedRight,
}: {
  label: string;
  answer: { text: string; isSkipped: boolean };
  guessedRight: boolean;
}) {
  return (
    <div className="rounded-xl bg-plum-card2 px-3 py-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-cream/50">
        {label}
      </p>
      <p className={`mt-1 text-sm ${answer.isSkipped ? 'italic text-cream/40' : 'text-cream'}`}>
        {answer.text}
      </p>
      <p className={`mt-1 text-xs font-semibold ${guessedRight ? 'text-rose' : 'text-cream/40'}`}>
        {guessedRight ? 'A deviné juste' : 'N’a pas deviné'}
      </p>
    </div>
  );
}
