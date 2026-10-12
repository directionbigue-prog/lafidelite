'use client';

// The playable taste of the game at `/demo` (Lot 2, Task 24) — a full
// three-round trial a visitor finishes with no account, no Espace Couple and
// no session.
//
// WHO PLAYS (project-owner decision): "solo, sans compte ni couple". The
// visitor answers their own side; the other side is `DEMO_CHARACTER_NAME`, a
// demo character whose answers are written down in `demo-questions.ts`.
// Every screen that shows the character says so — this component must never
// let a visitor believe someone real is answering, and it never renders a
// number as a measurement of a real relationship.
//
// SIGNED IN, BUT STILL NO NETWORK. `useUser` gates the screen — by product
// decision the trial is what you get for creating an account, so nothing is
// playable anonymously any more. Everything BELOW that gate is unchanged and
// deliberately offline: no `fetch`, no `api()`, no session is read or
// written, and no row is created. The demo costs nothing and consumes
// nothing — in particular it never touches the account's one free game,
// which is spent only by `POST /api/games`.
//
// The whole game runs in `useState` over the REAL engine —
// `lib/server/game/state-machine.ts` for the phases,
// `lib/server/game/scoring.ts` for the score (Design Decision 7) — so what
// the demo shows can never drift from what the real game computes.
//
// Every decision lives in `@/lib/demo/demo-flow` as pure, unit-tested
// functions (this repo ships no jsdom / Testing Library, by project-owner
// decision); this component is the thin render wrapper over them, plus the
// selection helpers it shares with the authenticated question screen.
import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/contexts/AuthContext';
import { Timer } from '@/components/game/Timer';
import { DisclaimerGate } from '@/components/game/DisclaimerGate';
import { roundLabel, TOTAL_ROUNDS } from '@/lib/game/round-labels';
import {
  EMPTY_SELECTION,
  applySelection,
  canSubmitAnswer,
  currentAnswerStep,
  selectedOptionIdForStep,
  stepCopy,
  type AnswerSelection,
} from '@/lib/game/question-screen';
import { buildResultsSections, type ResultsSection } from '@/lib/game/resultats';
import type { RevealRow } from '@/lib/game/round-reveal';
import {
  DEMO_QUESTION_DURATION_MS,
  DEMO_UNKNOWN_PHASE_MESSAGE,
  advanceDemoRound,
  beginDemoRound,
  buildDemoRevealRows,
  computeDemoResult,
  currentDemoQuestion,
  demoColumnLabels,
  demoScreenForPhase,
  recordDemoAnswer,
  skipDemoQuestion,
  startDemo,
  toDemoResultsResponse,
  type DemoFlowState,
} from '@/lib/demo/demo-flow';
import {
  DEMO_CHARACTER_DISCLOSURE,
  DEMO_CHARACTER_NAME,
  DEMO_CHARACTER_ROLE_LABEL,
  DEMO_QUESTIONS_PER_ROUND,
} from '@/lib/demo/demo-questions';
import { buttonClass } from '@/components/ui/Button';
import { FocusLayout } from '@/components/ui/FocusLayout';

// `PAGE_CLASS` / `CENTERED_PAGE_CLASS` used to live here: two more copies
// of the root every game screen was re-declaring. They are `FocusLayout`
// now, which is where that decision belongs — the demo is the same game on
// the same shell, and it must not be the one screen that misses a layout
// fix because its root was written out separately.
const CTA_CLASS = buttonClass('primary');
const SECONDARY_CTA_CLASS = buttonClass('ghost');

/** The small badge that names the demo character wherever they appear. */
function DemoPartnerBadge() {
  return (
    <p className="rounded-xl border border-rose/30 bg-plum-card2 px-4 py-3 text-xs leading-relaxed text-cream/70">
      <span className="font-semibold text-rose">
        {DEMO_CHARACTER_NAME} · {DEMO_CHARACTER_ROLE_LABEL}
      </span>
      <br />
      {DEMO_CHARACTER_DISCLOSURE}
    </p>
  );
}

export function DemoGame() {
  // The gate. Redirects to /connexion when nobody is signed in - the trial
  // is what an account buys you, not what a visitor gets for free.
  const user = useUser('/connexion');
  const [accepted, setAccepted] = useState(false);
  const [state, setState] = useState<DemoFlowState>(startDemo);
  const [selection, setSelection] = useState<AnswerSelection>(EMPTY_SELECTION);

  // The Timer reports a claim every 250ms. It lives in a ref so a tick never
  // re-renders the question — and, as on the authenticated screen, so it can
  // never gate the submit control.
  const clientElapsedMsRef = useRef(0);
  const handleElapsedChange = useCallback((elapsedMs: number) => {
    clientElapsedMsRef.current = elapsedMs;
  }, []);

  const restart = () => {
    setState(startDemo());
    setSelection(EMPTY_SELECTION);
    setAccepted(true);
  };

  // After every hook, never before: `useUser` returns null both while the
  // session is still loading and once it has redirected, and bailing out
  // above the hooks would change their order between renders.
  if (!user) return null;

  if (!accepted) {
    return (
      <FocusLayout centerText>
        <p className="text-xs uppercase tracking-[0.2em] text-rose">Partie de démonstration</p>
        <h1 className="font-serif text-3xl">Essayez une partie</h1>
        <DemoPartnerBadge />
        <DisclaimerGate
          state="accept"
          partnerName={DEMO_CHARACTER_NAME}
          onAccept={() => setAccepted(true)}
          // Required by the component, but unreachable here: the "waiting for
          // your partner" face is only rendered for `state="waiting"`, and a
          // solo demo has no partner to wait on.
          onRefresh={() => setAccepted(true)}
        />
      </FocusLayout>
    );
  }

  const screen = demoScreenForPhase(state.session.phase);
  const label = roundLabel(state.session.currentRoundNumber);

  if (screen === 'intro') {
    return (
      <FocusLayout centerText>
        <p className="text-sm uppercase tracking-[0.2em] text-rose">
          Manche {state.session.currentRoundNumber} sur {TOTAL_ROUNDS}
        </p>
        <h1 className="font-serif text-4xl">{label?.title ?? 'Manche'}</h1>
        {label !== null && <p className="max-w-sm text-cream/80">{label.rule}</p>}
        <p className="text-xs text-cream/50">
          {DEMO_QUESTIONS_PER_ROUND} questions dans cette manche de démonstration.
        </p>
        <DemoPartnerBadge />
        <button
          type="button"
          onClick={() => {
            setSelection(EMPTY_SELECTION);
            setState(beginDemoRound(state, new Date()));
          }}
          className={CTA_CLASS}
        >
          Commencer la manche
        </button>
      </FocusLayout>
    );
  }

  if (screen === 'question') {
    const question = currentDemoQuestion(state);
    if (question === null) {
      return <DemoDeadEndFallback onRestart={restart} />;
    }

    const step = currentAnswerStep(question.roundType, selection);
    const copy = stepCopy(step);
    const highlightedOptionId = selectedOptionIdForStep(question.roundType, selection);
    const readyToSubmit = canSubmitAnswer(question.roundType, selection);
    const ownAnswerText =
      selection.ownOptionId === null
        ? null
        : (question.options.find((o) => o.id === selection.ownOptionId)?.text ?? null);

    const submit = () => {
      const { ownOptionId, predictionOptionId } = selection;
      if (ownOptionId === null) return;
      if (question.roundType === 'MIROIR' && predictionOptionId === null) return;

      setState(
        recordDemoAnswer(
          state,
          {
            ownOptionId,
            ...(predictionOptionId !== null ? { predictionOptionId } : {}),
            elapsedMs: clientElapsedMsRef.current,
          },
          new Date(),
        ),
      );
      setSelection(EMPTY_SELECTION);
    };

    const skip = () => {
      setState(skipDemoQuestion(state, clientElapsedMsRef.current, new Date()));
      setSelection(EMPTY_SELECTION);
    };

    return (
      <FocusLayout align="top">
        <header className="flex items-start justify-between gap-4">
          <div className="text-left">
            <p className="text-sm uppercase tracking-[0.2em] text-rose">
              {label?.title ?? `Manche ${state.session.currentRoundNumber}`}
            </p>
            <p className="mt-1 text-xs text-cream/60">
              Question {state.session.currentQuestionNumber} sur {DEMO_QUESTIONS_PER_ROUND}
            </p>
          </div>
          {/* Cosmetic only — it never disables anything below. */}
          <Timer
            durationMs={DEMO_QUESTION_DURATION_MS}
            startedAt={state.session.currentQuestionShownAt ?? new Date()}
            onElapsedChange={handleElapsedChange}
          />
        </header>

        <div className="rounded-2xl bg-plum-card p-5 text-left">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-rose">{copy.label}</p>
          <p className="mt-1 text-xs text-cream/60">
            {step === 'prediction' ? `Devine ce que ${DEMO_CHARACTER_NAME} a répondu.` : copy.hint}
          </p>
          <h1 className="mt-4 font-serif text-2xl leading-snug">{question.prompt}</h1>
        </div>

        {step === 'prediction' && ownAnswerText !== null && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-plum-card2 px-4 py-3 text-left">
            <p className="text-xs text-cream/70">
              Ta réponse : <span className="font-semibold text-cream">{ownAnswerText}</span>
            </p>
            <button
              type="button"
              onClick={() => setSelection(EMPTY_SELECTION)}
              className="shrink-0 text-xs font-semibold text-rose underline underline-offset-4"
            >
              Modifier
            </button>
          </div>
        )}

        <ul className="flex flex-col gap-3">
          {question.options.map((option) => {
            const isSelected = option.id === highlightedOptionId;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() =>
                    setSelection((prev) => applySelection(question.roundType, prev, option.id))
                  }
                  className={`w-full rounded-xl border px-4 py-4 text-left text-sm transition-colors ${
                    isSelected
                      ? 'border-rose bg-wine text-cream'
                      : 'border-cream/15 bg-plum-card2 text-cream/90 hover:border-rose/60'
                  }`}
                >
                  {option.text}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto flex flex-col items-center gap-3 pt-4">
          <button type="button" onClick={submit} disabled={!readyToSubmit} className={CTA_CLASS}>
            Valider
          </button>
          <button
            type="button"
            onClick={skip}
            className="text-sm font-semibold text-cream/70 underline underline-offset-4 transition-colors hover:text-rose"
          >
            Passer cette question
          </button>
        </div>
      </FocusLayout>
    );
  }

  if (screen === 'reveal') {
    const rows = buildDemoRevealRows(state.session.currentRoundNumber, state.answers);
    const columns = demoColumnLabels();

    return (
      <FocusLayout align="top">
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-rose">
            Manche {state.session.currentRoundNumber} sur {TOTAL_ROUNDS} · terminée
          </p>
          <h1 className="mt-2 font-serif text-3xl">{label?.title ?? 'Résultats de la manche'}</h1>
        </header>

        <DemoPartnerBadge />

        <ul className="flex flex-col gap-4">
          {rows.map((row) => (
            <RevealRowView
              key={row.id}
              row={row}
              creatorLabel={columns.creatorLabel}
              partnerLabel={columns.partnerLabel}
            />
          ))}
        </ul>

        <div className="mt-auto flex flex-col items-center gap-3 pt-4">
          <button
            type="button"
            onClick={() => setState(advanceDemoRound(state))}
            className={CTA_CLASS}
          >
            {state.session.currentRoundNumber < TOTAL_ROUNDS
              ? 'Manche suivante'
              : 'Voir le résultat'}
          </button>
        </div>
      </FocusLayout>
    );
  }

  if (screen === 'results') {
    const sections = buildResultsSections(
      toDemoResultsResponse(computeDemoResult(state.answers)),
      demoColumnLabels(),
    );

    return (
      <FocusLayout align="top">
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-rose">Démonstration terminée</p>
          <h1 className="mt-2 font-serif text-3xl">Votre résultat d’essai</h1>
          <p className="mt-3 text-sm leading-relaxed text-cream/70">
            Ce chiffre vient d’une partie jouée contre un personnage écrit à l’avance. Il ne dit
            rien de votre couple — il montre juste comment le jeu se termine.
          </p>
        </header>

        <div className="flex flex-col gap-6">
          {sections.map((section) => (
            <ResultsSectionView key={section.kind} section={section} />
          ))}
        </div>

        <DemoPartnerBadge />

        <div className="mt-auto flex flex-col items-center gap-3 pt-4">
          <Link href="/inscription" className={CTA_CLASS}>
            Créer notre Espace Couple
          </Link>
          <button type="button" onClick={restart} className={SECONDARY_CTA_CLASS}>
            Rejouer la démonstration
          </button>
          <Link href="/" className={SECONDARY_CTA_CLASS}>
            Retour à l’accueil
          </Link>
        </div>
      </FocusLayout>
    );
  }

  return <DemoDeadEndFallback onRestart={restart} />;
}

/**
 * The escape hatch this lot's "every non-transient state stays actionable"
 * constraint requires — reached only if the flow lands on a phase this build
 * does not recognize, or on a question index that has no question.
 */
function DemoDeadEndFallback({ onRestart }: { onRestart: () => void }) {
  return (
    <FocusLayout centerText>
      <p role="alert" className="text-sm text-rose">
        {DEMO_UNKNOWN_PHASE_MESSAGE}
      </p>
      <button type="button" onClick={onRestart} className={CTA_CLASS}>
        Relancer la démonstration
      </button>
      <Link href="/" className={SECONDARY_CTA_CLASS}>
        Retour à l’accueil
      </Link>
    </FocusLayout>
  );
}

function RevealRowView({
  row,
  creatorLabel,
  partnerLabel,
}: {
  row: RevealRow;
  creatorLabel: string;
  partnerLabel: string;
}) {
  return (
    <li className="rounded-2xl bg-plum-card p-5 text-left">
      <p className="font-serif text-lg leading-snug">{row.prompt}</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <AnswerCell label={creatorLabel} text={row.creatorAnswer.text} />
        <AnswerCell label={partnerLabel} text={row.partnerAnswer.text} />
      </div>

      {row.mirror !== null && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <AnswerCell
            label={`${creatorLabel} · prédiction`}
            text={row.mirror.creatorPrediction.text}
            verdict={row.mirror.creatorGuessedRight}
          />
          <AnswerCell
            label={`${partnerLabel} · prédiction`}
            text={row.mirror.partnerPrediction.text}
            verdict={row.mirror.partnerGuessedRight}
          />
        </div>
      )}
    </li>
  );
}

function AnswerCell({ label, text, verdict }: { label: string; text: string; verdict?: boolean }) {
  return (
    <div className="rounded-xl bg-plum-card2 px-3 py-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-cream/50">
        {label}
      </p>
      <p className="mt-1 text-sm text-cream/90">{text}</p>
      {verdict !== undefined && (
        <p className={`mt-1 text-xs font-semibold ${verdict ? 'text-rose' : 'text-cream/50'}`}>
          {verdict ? 'Bien deviné' : 'Raté'}
        </p>
      )}
    </div>
  );
}

function ResultsSectionView({ section }: { section: ResultsSection }) {
  switch (section.kind) {
    case 'coupleScore':
      return (
        <section className="rounded-3xl bg-plum-card p-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-cream/50">Score de la partie</p>
          <p className="mt-2 font-serif text-6xl leading-none text-rose">{section.coupleScore}</p>
        </section>
      );

    case 'complicityLevel':
      return (
        <section className="text-center">
          <p className="text-sm text-cream/70">
            Niveau atteint dans la démonstration :{' '}
            <span className="font-semibold text-cream">{section.label}</span>
          </p>
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
            <div className="grid grid-cols-2 gap-3">
              <ScoreCell label={section.creatorLabel} score={section.creatorScore} />
              <ScoreCell label={section.partnerLabel} score={section.partnerScore} />
            </div>
          )}
        </section>
      );

    case 'titles':
      return (
        <section className="grid grid-cols-2 gap-3">
          <TitleCell label={section.creatorLabel} title={section.creatorTitle} />
          <TitleCell label={section.partnerLabel} title={section.partnerTitle} />
        </section>
      );

    case 'conversationPrompts':
      return (
        <section className="rounded-2xl bg-plum-card p-5">
          <h2 className="font-serif text-xl">Ce que la vraie partie vous proposerait</h2>
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
    <div className="rounded-xl bg-plum-card2 px-3 py-4 text-center">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-cream/50">
        {label}
      </p>
      <p className="mt-1 font-serif text-2xl text-cream">{score}</p>
    </div>
  );
}

function TitleCell({ label, title }: { label: string; title: string }) {
  return (
    <div className="rounded-xl bg-plum-card2 px-3 py-4 text-center">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-cream/50">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-rose">{title}</p>
    </div>
  );
}
