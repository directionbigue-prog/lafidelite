'use client';

// Cosmetic countdown ring/number for a game question. The SERVER is the
// sole authority on elapsed time — see `computeEffectiveElapsedMs` in
// `src/lib/server/game/scoring.ts`, which takes the MAX of this
// component's `onElapsedChange` claim and its own server-side measurement
// (minus a network-grace window) so a malicious client cannot under-report
// elapsed time to farm a speed bonus.
//
// Two invariants this component must never violate:
//   1. It must never gate submission — no disabling anything, no
//      auto-submit, no lockout at 0. A slow player must still be able to
//      answer late; the server simply won't reward it with a speed bonus.
//      (In practice: this component renders no interactive elements at
//      all, so there is nothing here that *could* gate submission.)
//   2. `onElapsedChange` reports a claim, not a truth — keep the mapping
//      from wall-clock time to the reported value a simple clamp, no
//      heuristics.
import { useEffect, useRef, useState } from 'react';

export interface TimerProps {
  durationMs: number;
  startedAt: Date;
  onElapsedChange: (elapsedMs: number) => void;
  /**
   * The three colours the countdown needs from the ground it sits on —
   * satisfied by a `GroundChrome`, so the question screen just forwards
   * its own. Defaults to the app's dark ground.
   */
  tone?: { timerShell: string; timerNumber: string; timerRing: string };
}

const TICK_INTERVAL_MS = 250;
/**
 * The dark ground's colours, used when no chrome is passed. The countdown
 * is also rendered on the Scénarios round's cream page, where every one of
 * these would be wrong — see `lib/game/round-ground.ts`.
 */
const DEFAULT_TONE = {
  timerShell: 'border-gold/40 bg-plum-card2',
  timerNumber: 'bg-cream text-ink',
  timerRing: '#8B2C56', // wine
};

/**
 * Clamp the wall-clock elapsed time into [0, durationMs]. Exported so the
 * tick logic can be unit-tested directly: this repo ships no jsdom / React
 * Testing Library dependency yet (verified before writing tests — see
 * Timer.test.tsx), so the interval math is validated here without
 * mounting the component to a DOM. The component's interval callback below
 * calls this function and passes the result straight to both `setState`
 * and `onElapsedChange` with no further transformation, so testing this
 * function directly is equivalent to testing the tick behavior.
 */
export function computeClampedElapsedMs(
  nowMs: number,
  startedAtMs: number,
  durationMs: number,
): number {
  const raw = nowMs - startedAtMs;
  return Math.min(Math.max(raw, 0), durationMs);
}

export interface TimerDisplay {
  remainingSeconds: number;
  progressDegrees: number;
}

/**
 * Pure mapping from `elapsedMs` (already clamped by
 * `computeClampedElapsedMs`) to everything the render below shows. Kept as
 * its own exported, directly-testable function — same rationale as
 * `computeClampedElapsedMs` above — specifically so a regression here (e.g.
 * showing elapsed instead of remaining) is caught by an exact-value unit
 * test, never by a loose substring match against rendered markup.
 */
export function computeTimerDisplay(elapsedMs: number, durationMs: number): TimerDisplay {
  const remainingMs = Math.max(durationMs - elapsedMs, 0);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const progressRatio = durationMs > 0 ? Math.min(elapsedMs / durationMs, 1) : 1;
  const progressDegrees = progressRatio * 360;
  return { remainingSeconds, progressDegrees };
}

export function Timer({ durationMs, startedAt, onElapsedChange, tone = DEFAULT_TONE }: TimerProps) {
  const startedAtMs = startedAt.getTime();

  // Keep the latest callback in a ref so the interval effect below does not
  // need `onElapsedChange` in its dependency array — restarting the
  // interval every time the parent passes a new function identity would
  // drift the tick alignment for no benefit.
  const onElapsedChangeRef = useRef(onElapsedChange);
  useEffect(() => {
    onElapsedChangeRef.current = onElapsedChange;
  }, [onElapsedChange]);

  const [elapsedMs, setElapsedMs] = useState(() =>
    computeClampedElapsedMs(Date.now(), startedAtMs, durationMs),
  );

  useEffect(() => {
    const tick = () => {
      const next = computeClampedElapsedMs(Date.now(), startedAtMs, durationMs);
      setElapsedMs(next);
      onElapsedChangeRef.current(next);
    };

    tick();
    const intervalId = setInterval(tick, TICK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [startedAtMs, durationMs]);

  const { remainingSeconds, progressDegrees } = computeTimerDisplay(elapsedMs, durationMs);

  return (
    <div
      className={`flex h-14 w-14 select-none items-center justify-center rounded-full border p-1 ${tone.timerShell}`}
      role="timer"
      aria-live="off"
      aria-label={`Temps restant : ${remainingSeconds} secondes`}
    >
      <div
        className="flex h-full w-full items-center justify-center rounded-full"
        style={{
          backgroundImage: `conic-gradient(${tone.timerRing} ${progressDegrees}deg, transparent ${progressDegrees}deg)`,
        }}
      >
        <span className={`rounded-full px-2 py-1 text-sm font-semibold ${tone.timerNumber}`}>
          {remainingSeconds}
        </span>
      </div>
    </div>
  );
}
