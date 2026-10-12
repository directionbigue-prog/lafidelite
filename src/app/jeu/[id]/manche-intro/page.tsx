'use client';

// /jeu/[id]/manche-intro — the interstitial shown between rounds (Lot 2,
// Task 19): "Manche 2 sur 3 — Scénarios", plus a one-line reminder of how
// that round is played, and a single button onward to the pass-the-device
// screen.
//
// Read-only by design. `GET /api/games/current` is safe to call here (it
// never advances a turn), and the round's identity comes from
// `roundLabel(currentRoundNumber)` rather than an extra API field — the
// round-number -> round-type mapping is fixed at game creation. An
// unrecognized round number renders an explicit error instead of
// defaulting to round 1.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { gameErrorMessage } from '@/lib/game/api-result';
import { roundLabel, type RoundLabel } from '@/lib/game/round-labels';
import { GameProgressHeader } from '@/components/game/GameProgress';
import { gameProgress } from '@/lib/game/progress';
import { guardPhase, mancheIntroExpectedPhases } from '@/lib/game/phase-routes';
import { buttonClass } from '@/components/ui/Button';
import { FocusLayout } from '@/components/ui/FocusLayout';

interface CurrentGameSessionResponse {
  id: string;
  currentRoundNumber: number;
  currentQuestionNumber: number;
  phase: string;
  questionsPerRound: number[];
}

type ScreenState =
  | { kind: 'loading' }
  // `sessionId` is the id the server just returned, NOT the `[id]` route
  // param — see the note in the passe screen: a stale tab must not carry a
  // finished game's id into the next screen.
  | {
      kind: 'ready';
      sessionId: string;
      roundNumber: number;
      label: RoundLabel;
      /** This session's round lengths — the formats make them vary. */
      questionsPerRound: number[];
    }
  | { kind: 'error'; message: string };

const UNKNOWN_ROUND_MESSAGE = 'Cette manche est dans un état inconnu. Revenez à l’accueil du jeu.';

export default function MancheIntroPage() {
  const user = useUser('/connexion');
  const router = useRouter();
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await api<CurrentGameSessionResponse>('/api/games/current');
        if (cancelled) return;

        // Boot guard: without it, a Back button from the reveal renders
        // "Manche 2 sur 3" for a round that already finished.
        //
        // The accepted list depends on the question number, because
        // PASS_DEVICE means two different things — see
        // `mancheIntroExpectedPhases`. In short: `GET /api/games/current`
        // resolves ROUND_INTRO away on every read, so guarding on
        // ROUND_INTRO alone would match nothing this endpoint can return
        // and skip the round 2 and 3 intros entirely; but accepting
        // PASS_DEVICE unconditionally would re-show the intro card on a
        // mid-round hand-off. Only question 1 is a round's real start.
        // `current/route.test.ts` pins the endpoint contract.
        const guard = guardPhase(
          res.id,
          res.phase,
          mancheIntroExpectedPhases(res.currentQuestionNumber),
        );
        if (guard.kind === 'redirect') {
          router.replace(guard.path);
          return;
        }
        if (guard.kind === 'error') {
          setState({ kind: 'error', message: UNKNOWN_ROUND_MESSAGE });
          return;
        }

        const label = roundLabel(res.currentRoundNumber);
        if (!label) {
          setState({ kind: 'error', message: UNKNOWN_ROUND_MESSAGE });
          return;
        }
        setState({
          kind: 'ready',
          sessionId: res.id,
          roundNumber: res.currentRoundNumber,
          label,
          questionsPerRound: res.questionsPerRound,
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

  return (
    <FocusLayout centerText>
      {state.kind === 'loading' && (
        <p role="status" className="text-sm text-cream/60">
          Chargement…
        </p>
      )}

      {state.kind === 'ready' && (
        <>
          <div className="w-full">
            <GameProgressHeader
              progress={gameProgress(
                { kind: 'roundStart', roundNumber: state.roundNumber },
                state.questionsPerRound,
              )}
              showRoundTitle={false}
            />
          </div>
          <h1 className="font-serif text-4xl">{state.label.title}</h1>
          <p className="max-w-sm text-cream/80">{state.label.rule}</p>
          <button
            type="button"
            onClick={() => router.push(`/jeu/${state.sessionId}/passe`)}
            className={buttonClass()}
          >
            Commencer la manche
          </button>
        </>
      )}

      {state.kind === 'error' && (
        <>
          <p role="alert" className="text-sm text-rose">
            {state.message}
          </p>
          <button type="button" onClick={() => router.push('/jeu')} className={buttonClass()}>
            Retour à l’accueil du jeu
          </button>
        </>
      )}
    </FocusLayout>
  );
}
