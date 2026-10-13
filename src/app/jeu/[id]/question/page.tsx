'use client';

// /jeu/[id]/question — the screen where a player actually answers (Lot 2,
// Task 20).
//
// Boot sequence — STRICTLY sequential, read first:
//   1. `GET /api/games/current` takes NO id (it resolves the couple's
//      IN_PROGRESS session by `coupleId`), and returns the authoritative
//      session id, phase, round number and both joker counters.
//   2. `POST /api/games/${session.id}/start-turn` then flips
//      PASS_DEVICE -> ANSWERING, stamps the speed-bonus timer, and returns
//      the shaped question + `roundType` + `activePlayerRole` — but NOT the
//      joker counters, which is why step 1 exists at all (the task brief's
//      step 6 assumed `start-turn` returned them; it does not).
//
// The `[id]` route param is therefore NEVER trusted — same stance as the
// sibling `passe/page.tsx`, which reads no param at all. Every request and
// every navigation on this page uses the id the SERVER returned, so a stale
// tab cannot carry a finished game's id forward.
//
// The order matters beyond that: `/current` lazily resolves
// `ROUND_INTRO -> PASS_DEVICE`, a phase `start-turn` outright REJECTS, so
// reading first turns what would have been a 409 dead end into a normal
// start. It also puts the retryable GET before the non-retryable POST, and
// makes the ring's `startedAt` coincide with `start-turn` resolving instead
// of trailing a round-trip behind it. The two calls are still never issued
// in parallel: both write to the same session row.
//
// All branching logic lives in `@/lib/game/question-screen` as pure,
// unit-tested functions (this repo has no jsdom / Testing Library, by
// project-owner decision) — this component stays a thin fetch + render
// wrapper over them.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { gameErrorMessage } from '@/lib/game/api-result';
import { Timer } from '@/components/game/Timer';
import { GameProgressHeader } from '@/components/game/GameProgress';
import { gameProgress } from '@/lib/game/progress';
import {
  QUESTION_DURATION_MS,
  EMPTY_SELECTION,
  applySelection,
  bootDecisionForPhase,
  buildAnswerBody,
  canSubmitAnswer,
  canUseJoker,
  currentAnswerStep,
  interpretSkipFailure,
  jokersRemainingForRole,
  nextPathAfterSubmit,
  selectedOptionIdForStep,
  stepCopy,
  type AnswerSelection,
} from '@/lib/game/question-screen';
import { buttonClass } from '@/components/ui/Button';
import { FocusLayout } from '@/components/ui/FocusLayout';
import { chromeForRound } from '@/lib/game/round-ground';
import { useDistance } from '@/contexts/DistanceContext';
import { questionSurLeMauvaisTelephone } from '@/lib/distance/distance';

interface ClientOption {
  id: string;
  text: string;
}

interface StartTurnResponse {
  activePlayerRole: string;
  roundType: string;
  currentQuestionNumber: number;
  question: { id: string; roundType: string; prompt: string; options: ClientOption[] };
}

interface CurrentGameSessionResponse {
  id: string;
  phase: string;
  currentRoundNumber: number;
  jokersRemainingCreator: number;
  jokersRemainingPartner: number;
  /** This session's round lengths — 2, 5 or 10, depending on the format. */
  questionsPerRound: number[];
  activePlayerRole: string;
}

interface AnswerSubmitResponse {
  phase: string;
}

interface SkipResponse {
  phase: string;
  jokersRemaining: number;
}

type ScreenState =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      /** From `GET /api/games/current` — NOT the `[id]` route param. */
      sessionId: string;
      roundType: string;
      roundNumber: number;
      questionNumber: number;
      questionsPerRound: number[];
      prompt: string;
      options: ClientOption[];
      /** When the turn actually started, for the cosmetic countdown. */
      startedAt: Date;
    }
  | { kind: 'error'; message: string };

const CTA_CLASS = buttonClass('primary');

export default function QuestionPage() {
  const user = useUser('/connexion');
  const router = useRouter();
  // The `[id]` route param is deliberately NOT read — see the module
  // header. `GET /api/games/current` needs no id and is the authority on
  // which session is in progress.

  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const { modeDistance } = useDistance();
  const [selection, setSelection] = useState<AnswerSelection>(EMPTY_SELECTION);
  const [jokersRemaining, setJokersRemaining] = useState<number | null>(null);
  const [jokersExhausted, setJokersExhausted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The Timer reports a claim every 250ms. Keeping it in a ref rather than
  // state means the countdown does not re-render the whole question on each
  // tick — and, more importantly, that it can never gate anything below:
  // nothing reads this except the request body builders.
  const clientElapsedMsRef = useRef(0);
  const handleElapsedChange = useCallback((elapsedMs: number) => {
    clientElapsedMsRef.current = elapsedMs;
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void (async () => {
      try {
        // Read first, then write — sequential on purpose, see the module
        // header.
        const session = await api<CurrentGameSessionResponse>('/api/games/current');
        if (cancelled) return;

        // The phase is authoritative here, BEFORE `start-turn` is called,
        // so a session that belongs on another screen is routed there
        // rather than eating a 409 INVALID_PHASE.
        const boot = bootDecisionForPhase(session.id, session.phase);
        if (boot.kind === 'error') {
          setState({ kind: 'error', message: boot.message });
          return;
        }
        if (boot.kind === 'navigate') {
          router.push(boot.path);
          return;
        }

        // À distance, cet écran n'a sa place que sur le téléphone du joueur
        // actif : sur l'autre, `start-turn` lancerait le chronomètre pour
        // quelqu'un qui ne tient pas le téléphone. Lu seulement en mode à
        // distance — en pass-and-play, un seul téléphone sert aux deux.
        if (modeDistance) {
          const me = await api<{ couple: { viewerRole?: string } | null }>('/api/couples/me');
          if (cancelled) return;
          if (
            questionSurLeMauvaisTelephone(
              true,
              session.activePlayerRole,
              me.couple?.viewerRole ?? '',
            )
          ) {
            router.replace(`/jeu/${session.id}/passe`);
            return;
          }
        }

        const turn = await api<StartTurnResponse>(
          `/api/games/${encodeURIComponent(session.id)}/start-turn`,
          { method: 'POST' },
        );
        if (cancelled) return;
        // Captured only now, so the ring starts at a full duration instead
        // of trailing the `/current` round-trip.
        const startedAt = new Date();

        setJokersRemaining(
          jokersRemainingForRole(
            turn.activePlayerRole,
            session.jokersRemainingCreator,
            session.jokersRemainingPartner,
          ),
        );
        setState({
          kind: 'ready',
          sessionId: session.id,
          roundType: turn.roundType,
          roundNumber: session.currentRoundNumber,
          questionNumber: turn.currentQuestionNumber,
          questionsPerRound: session.questionsPerRound,
          prompt: turn.question.prompt,
          options: turn.question.options,
          startedAt,
        });
      } catch (err) {
        if (!cancelled) setState({ kind: 'error', message: gameErrorMessage(err) });
      }
    })();

    return () => {
      cancelled = true;
    };
    // `modeDistance` est lu au chargement seulement, volontairement absent des
    // dépendances : changer de mode en pleine question ne doit pas relancer
    // `start-turn`.
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

  const step = currentAnswerStep(state.roundType, selection);
  const copy = stepCopy(step);
  const highlightedOptionId = selectedOptionIdForStep(state.roundType, selection);
  const readyToSubmit = canSubmitAnswer(state.roundType, selection);
  const skipAllowed = canUseJoker(jokersRemaining) && !jokersExhausted;
  const ownAnswerText =
    selection.ownOptionId === null
      ? null
      : (state.options.find((o) => o.id === selection.ownOptionId)?.text ?? null);

  const submitAnswer = async () => {
    const body = buildAnswerBody(state.roundType, selection, clientElapsedMsRef.current);
    // `null` means the selection is incomplete — the control is already
    // disabled in that case; never fall through to an empty body.
    if (body === null) return;

    setBusy(true);
    setActionError(null);
    try {
      const res = await api<AnswerSubmitResponse>(
        `/api/games/${encodeURIComponent(state.sessionId)}/answers`,
        { method: 'POST', body },
      );
      const outcome = nextPathAfterSubmit(state.sessionId, res.phase);
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

  const skipQuestion = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await api<SkipResponse>(
        `/api/games/${encodeURIComponent(state.sessionId)}/skip`,
        { method: 'POST', body: { clientElapsedMs: clientElapsedMsRef.current } },
      );
      // The skip response carries the UPDATED count for the role that just
      // skipped — take it from here rather than re-fetching `/current`.
      setJokersRemaining(res.jokersRemaining);
      const outcome = nextPathAfterSubmit(state.sessionId, res.phase);
      if (outcome.kind === 'error') {
        setActionError(outcome.message);
        setBusy(false);
        return;
      }
      router.push(outcome.path);
    } catch (err) {
      const outcome = interpretSkipFailure(err);
      // NO_JOKERS_LEFT is terminal for this control: disable it and do NOT
      // retry — a retry can only be refused again.
      if (outcome.jokersExhausted) setJokersExhausted(true);
      setActionError(outcome.message);
      setBusy(false);
    }
  };

  const chrome = chromeForRound(state.roundType);

  return (
    /*
      The ground follows the round — see `lib/game/round-ground.ts`. Every
      colour below comes from `chrome`, never from a literal: on the
      Scénarios round this same markup is dark text on cream, and a single
      hardcoded `text-cream` here would be invisible rather than merely
      off.
    */
    <FocusLayout align="top" ground={chrome.layout}>
      <GameProgressHeader
        progress={gameProgress(
          {
            kind: 'question',
            roundNumber: state.roundNumber,
            questionNumber: state.questionNumber,
          },
          state.questionsPerRound,
        )}
        chrome={chrome}
        trailing={
          // Cosmetic only — it never disables anything below.
          <Timer
            durationMs={QUESTION_DURATION_MS}
            startedAt={state.startedAt}
            onElapsedChange={handleElapsedChange}
            tone={chrome}
          />
        }
      />

      {/*
        The question sits directly on the ground, not in a card. The canvas
        is emphatic about this and it is right: the prompt is the screen,
        and a border drawn around it makes it one element among several.
      */}
      <div className="mt-2 text-left">
        <p className={`text-sm ${chrome.muted}`}>{copy.label}</p>
        <h1 className="mt-3 font-serif text-[31px] leading-[1.16]">{state.prompt}</h1>
        <p className={`mt-3 text-sm leading-relaxed ${chrome.muted}`}>{copy.hint}</p>
      </div>

      {step === 'prediction' && ownAnswerText !== null && (
        <div
          className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-xs ${chrome.panel}`}
        >
          <p>
            Ta réponse : <span className="font-semibold">{ownAnswerText}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              setSelection(EMPTY_SELECTION);
              setActionError(null);
            }}
            disabled={busy}
            className={`shrink-0 font-semibold underline underline-offset-4 disabled:opacity-40 ${chrome.eyebrow}`}
          >
            Modifier
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {state.options.map((option) => {
          const isSelected = option.id === highlightedOptionId;
          return (
            <li key={option.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                disabled={busy}
                onClick={() =>
                  setSelection((prev) => applySelection(state.roundType, prev, option.id))
                }
                className={`flex w-full items-center justify-between gap-3 rounded-[20px] border px-5 py-4 text-left text-base leading-snug transition-colors disabled:opacity-50 ${
                  isSelected ? chrome.optionSelected : chrome.option
                }`}
              >
                <span>{option.text}</span>
                {/*
                  The tick is the canvas's confirmation mark. It is
                  `aria-hidden` because `aria-pressed` on the button
                  already announces the selection — a screen reader would
                  otherwise hear it twice, once as a state and once as a
                  stray glyph.
                */}
                {isSelected && (
                  <span aria-hidden className={`shrink-0 font-bold ${chrome.check}`}>
                    ✓
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {actionError !== null && (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm font-semibold text-wine">
            {actionError}
          </p>
          {/*
            The escape hatch this lot's "every non-transient state stays
            actionable" constraint requires. Some failures here are
            terminal for the turn even though the controls above stay
            live: if the answer POST commits but its response is lost
            (`api()` correctly never retries a POST), the session has
            already advanced server-side, so every manual retry now 409s
            NOT_ANSWERING_PHASE forever. Without this, a browser reload is
            the only way out.
          */}
          <button
            type="button"
            onClick={() => router.push('/jeu')}
            className={`text-xs font-semibold underline underline-offset-4 ${chrome.muted}`}
          >
            Retour à l’accueil du jeu
          </button>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-4 pt-6">
        {/*
          The reassurance the canvas prints under every question, and the
          one line on this screen that answers the question a player
          actually has before tapping: who is going to see this.
        */}
        <p className={`text-center text-xs leading-relaxed ${chrome.muted}`}>
          Personne ne verra votre réponse avant la fin de la manche.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void submitAnswer()}
            disabled={!readyToSubmit || busy}
            className={buttonClass(chrome.ctaVariant, true)}
          >
            Valider
          </button>

          {/*
            A pill beside the primary action rather than a line of
            underlined text below it. Skipping is a real move in this game
            — two jokers each, and they cost nothing — and burying it as
            small print made it read like an admission of failure.
          */}
          <button
            type="button"
            onClick={() => void skipQuestion()}
            disabled={!skipAllowed || busy}
            className={`${buttonClass(chrome.secondaryVariant)} shrink-0`}
          >
            Passer{jokersRemaining !== null && ` · ${jokersRemaining}`}
          </button>
        </div>
      </div>
    </FocusLayout>
  );
}
