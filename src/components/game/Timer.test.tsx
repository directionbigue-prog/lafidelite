// Test-precedent note (read before touching this file): as of this task,
// the repo has ZERO other `*.test.tsx` files, and neither `jsdom` nor
// `@testing-library/react` is an installed dependency (`vitest.config.ts`
// runs with `environment: 'node'`, no jsdom). Per the task brief, we do not
// add new dependencies. So this file combines:
//   1. Direct unit tests of the two exported pure functions the component
//      calls for EVERY value it derives — `computeClampedElapsedMs`
//      (what the interval tick reports) and `computeTimerDisplay` (what the
//      render shows). Every regression a review previously worried a
//      substring-matched render test could miss (e.g. showing elapsed
//      instead of remaining) is now caught here by an exact-value
//      assertion against the SAME function the component calls — never a
//      re-implementation or a copy of its logic.
//   2. Static-render smoke tests via `react-dom/server`'s
//      `renderToStaticMarkup`, which runs actual React reconciliation
//      (including the `useState` lazy initializer) without requiring a DOM,
//      to prove the component itself renders without throwing and that its
//      real output reflects the pure functions above — with assertions
//      anchored to the rendered text-node boundaries (`>45<`, not `'45'`)
//      so a hardcoded string elsewhere in the markup (the ring's hex color
//      contains digits) can never make an assertion vacuously pass.
//
// Known, disclosed gap (not covered here, and deliberately not faked):
// `useEffect` does not run during static rendering, so nothing in this file
// exercises the component's actual `setInterval`/`clearInterval` wiring —
// only the pure functions it calls on every tick. Mounting the component,
// letting its real interval fire, and observing `onElapsedChange`/cleanup
// would require jsdom or React Testing Library, neither of which this repo
// has; per the task owner's decision this residual is picked up by the
// manual end-to-end smoke test in Task 25, not by an automated test here.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Timer, computeClampedElapsedMs, computeTimerDisplay } from './Timer';

describe('computeClampedElapsedMs', () => {
  it('is 0 the instant the question starts', () => {
    expect(computeClampedElapsedMs(1_000, 1_000, 45_000)).toBe(0);
  });

  it('counts up as wall-clock time passes, one 250ms tick at a time', () => {
    const startedAtMs = 1_000_000;
    const durationMs = 45_000;

    const values: number[] = [];
    for (let elapsed = 0; elapsed <= 2_000; elapsed += 250) {
      values.push(computeClampedElapsedMs(startedAtMs + elapsed, startedAtMs, durationMs));
    }

    // Strictly increasing — matches "calls onElapsedChange with increasing
    // values" from the task brief.
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1] as number);
    }
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(2_000);
  });

  it('clamps to durationMs once the timer has fully elapsed, and stays there', () => {
    const startedAtMs = 0;
    const durationMs = 45_000;

    expect(computeClampedElapsedMs(45_000, startedAtMs, durationMs)).toBe(45_000);
    // Well past duration — must never exceed durationMs (no runaway values
    // for a slow/late submission; a slow player must still be able to
    // answer, the timer just reports the cap).
    expect(computeClampedElapsedMs(60_000, startedAtMs, durationMs)).toBe(45_000);
    expect(computeClampedElapsedMs(10_000_000, startedAtMs, durationMs)).toBe(45_000);
  });

  it('never reports a negative elapsed time, even for a clock claiming elapsed < 0', () => {
    const startedAtMs = 10_000;
    const durationMs = 45_000;

    expect(computeClampedElapsedMs(5_000, startedAtMs, durationMs)).toBe(0);
  });

  it('produces a monotonically increasing, then durationMs-capped, sequence across many ticks', () => {
    // Same 250ms tick spacing the component's real interval uses
    // (`TICK_INTERVAL_MS` in Timer.tsx), applied directly to the exported
    // function the component's effect calls — no local re-implementation
    // of the tick loop, just the function itself over generated inputs.
    const startedAtMs = new Date('2026-09-03T12:00:00.000Z').getTime();
    const durationMs = 45_000;
    const nowValues = Array.from({ length: 201 }, (_, i) => startedAtMs + i * 250); // 0ms..50_000ms

    const results = nowValues.map((nowMs) =>
      computeClampedElapsedMs(nowMs, startedAtMs, durationMs),
    );

    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeGreaterThanOrEqual(results[i - 1] as number);
    }
    expect(results[0]).toBe(0);
    expect(Math.max(...results)).toBe(durationMs);
    // Once past the 45s mark it must stay clamped, never exceeding it —
    // this is what lets a slow player submit late without the timer ever
    // reporting something nonsensical.
    expect(results.at(-1)).toBe(durationMs);
  });
});

describe('computeTimerDisplay', () => {
  it('shows the full duration in seconds at elapsed = 0', () => {
    expect(computeTimerDisplay(0, 45_000)).toEqual({ remainingSeconds: 45, progressDegrees: 0 });
  });

  it('shows the exact remaining seconds partway through — pinned to an exact value, not a substring', () => {
    // This is the exact case a prior review flagged: a substring check
    // like `toContain('5')` would pass even if remaining were computed as
    // elapsed instead of duration-minus-elapsed. An exact-value `toBe`
    // against this function cannot make that mistake.
    expect(computeTimerDisplay(40_000, 45_000).remainingSeconds).toBe(5);
  });

  it('shows 0 remaining once elapsed reaches durationMs, and never goes negative', () => {
    expect(computeTimerDisplay(45_000, 45_000).remainingSeconds).toBe(0);
    // Defensive: even if elapsedMs somehow exceeded durationMs, remaining
    // must clamp at 0, never go negative.
    expect(computeTimerDisplay(60_000, 45_000).remainingSeconds).toBe(0);
  });

  it('maps progress to a full 360deg sweep exactly at elapsed = durationMs', () => {
    expect(computeTimerDisplay(0, 45_000).progressDegrees).toBe(0);
    expect(computeTimerDisplay(45_000, 45_000).progressDegrees).toBe(360);
    expect(computeTimerDisplay(22_500, 45_000).progressDegrees).toBe(180);
  });
});

describe('Timer (static-render smoke tests)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the full duration in seconds right when the question starts', () => {
    const startedAt = new Date('2026-09-03T12:00:00.000Z');
    vi.setSystemTime(startedAt);

    const html = renderToStaticMarkup(
      <Timer durationMs={45_000} startedAt={startedAt} onElapsedChange={() => {}} />,
    );

    // Anchored to the text-node boundary, not a loose substring — the
    // ring's hardcoded hex color (`#8B2C56`) also contains a '5', so
    // `toContain('45')` alone would pass even if the countdown counted up.
    expect(html).toContain('>45<');
  });

  it('renders the exact remaining count partway through, without throwing', () => {
    const startedAt = new Date('2026-09-03T12:00:00.000Z');
    vi.setSystemTime(new Date(startedAt.getTime() + 40_000));

    let html = '';
    expect(() => {
      html = renderToStaticMarkup(
        <Timer durationMs={45_000} startedAt={startedAt} onElapsedChange={() => {}} />,
      );
    }).not.toThrow();

    expect(html).toContain('>5<');
  });

  it('does not throw at 0 remaining, and never renders a disabled/button element to gate submission', () => {
    const startedAt = new Date('2026-09-03T12:00:00.000Z');
    // Well past the full duration — the "slow player" case.
    vi.setSystemTime(new Date(startedAt.getTime() + 90_000));

    let html = '';
    expect(() => {
      html = renderToStaticMarkup(
        <Timer durationMs={45_000} startedAt={startedAt} onElapsedChange={() => {}} />,
      );
    }).not.toThrow();

    expect(html).toContain('>0<');
    // No interactive/disableable elements anywhere in the component's
    // output — nothing here can gate a late submission.
    expect(html).not.toMatch(/disabled/i);
    expect(html).not.toMatch(/<button/i);
    expect(html).not.toMatch(/<input/i);
  });
});
