// The header every in-game screen shares: which chapter, how far in, and a
// tick per question of the current round.
//
// ── Why a tick per QUESTION, not per round ───────────────────────────
// It used to be one segment per round, part-filled. The design canvas
// draws five ticks for a five-question round and fills the ones already
// answered, and it is the better reading of what a couple wants to know
// mid-round: "two more and this chapter is done" is legible at a glance,
// where a bar at 40% is not. It also stopped being possible to draw the
// old bar honestly once the three formats shipped — a Longue soirée round
// holds ten questions, an Express round holds two.
//
// Renders NOTHING when `gameProgress` returned null. A screen that cannot
// say where it is shows no bar rather than a wrong one — same rule as
// `roundLabel` and `routeForPhase`.
import type { ReactNode } from 'react';
import type { GameProgress } from '@/lib/game/progress';
import { groundChrome, type GroundChrome } from '@/lib/game/round-ground';

export function GameProgressHeader({
  progress,
  trailing,
  chrome = groundChrome('dark'),
  showRoundTitle = true,
}: {
  progress: GameProgress | null;
  /** Right-aligned slot — the countdown on the question screen. */
  trailing?: ReactNode;
  /**
   * The colours of the ground this header sits on. Defaults to the app's
   * ink; the Scénarios round passes the light set.
   */
  chrome?: GroundChrome;
  /**
   * Off where the round's name is already the screen's headline — the
   * round interstitial. Showing it in both places is the doubled
   * "Miroir · Manche 1 sur 3" this component was written to remove, not
   * to reproduce one screen further along.
   */
  showRoundTitle?: boolean;
}) {
  if (!progress) return trailing ? <header className="flex justify-end">{trailing}</header> : null;

  return (
    <header className="flex flex-col gap-4">
      {/*
        `aria-hidden`: the ticks restate the position carried in words on
        the line below, and announcing both would read it twice. The label
        is the accessible source of truth.
      */}
      <div className="flex gap-1.5" aria-hidden>
        {progress.segments.map((segment) => (
          <div
            key={segment.questionNumber}
            className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
              segment.filled ? chrome.segmentFilled : chrome.segmentEmpty
            }`}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-4">
        {showRoundTitle ? (
          <p className={`text-[13px] font-semibold uppercase tracking-[0.12em] ${chrome.eyebrow}`}>
            {progress.heading}
          </p>
        ) : (
          <span />
        )}

        <div className={`flex shrink-0 items-center gap-3 text-sm ${chrome.muted}`}>
          <span>{progress.label}</span>
          {trailing}
        </div>
      </div>
    </header>
  );
}
