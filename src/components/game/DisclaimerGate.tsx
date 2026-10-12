'use client';

// The relational guardrail that stands between a couple and their first
// game (Lot 2, Task 23).
//
// This is not a legal notice and must not read like one. Its whole job is
// to set the frame BEFORE anyone answers anything: the game puts you in
// invented situations, and what comes out of it is a conversation starter,
// not a verdict on your relationship. Both partners have to have read it —
// the backend refuses to start a game until both acceptance timestamps are
// set, and `disclaimerGateState` decides which face this component shows.
//
// Extracted from `app/jeu/page.tsx`, where it first lived inline. It stays
// presentational on purpose: it owns no fetch and no state beyond what the
// parent passes, so the page keeps the single `POST
// /api/couples/disclaimer/accept` call and this component stays trivially
// reusable (the demo flow shows the same text before a trial game).
import type { DisclaimerGateState } from '@/lib/game/start-screen';
import { buttonClass } from '@/components/ui/Button';

export interface DisclaimerGateProps {
  /** Which face to show — from `disclaimerGateState(couple, viewerRole)`. */
  state: Extract<DisclaimerGateState, 'accept' | 'waiting'>;
  /** The other partner's display name, for the waiting message. */
  partnerName: string | null;
  /** True while the accept request is in flight. */
  accepting?: boolean;
  /** Wired by the parent to POST /api/couples/disclaimer/accept. */
  onAccept: () => void;
  /**
   * Re-checks whether the partner has accepted since. Required, not
   * optional: without it the waiting state is a dead end whose only
   * escape is a browser reload.
   */
  onRefresh: () => void;
}

const CTA_CLASS = buttonClass('primary');
const SECONDARY_CTA_CLASS =
  'rounded-full border border-rose/40 px-6 py-3 text-sm font-semibold text-cream transition-colors hover:bg-rose/10 disabled:opacity-50';

/** Fallback when the partner has no name recorded on their account. */
const PARTNER_FALLBACK = 'votre partenaire';

export function DisclaimerGate({
  state,
  partnerName,
  accepting = false,
  onAccept,
  onRefresh,
}: DisclaimerGateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-rose/30 bg-plum-card p-6">
      <h2 className="font-serif text-xl">Avant de commencer</h2>

      <p className="text-sm leading-relaxed text-cream/80">
        Les questions vous mettent face à des situations <strong>imaginaires</strong>. Ce que vous
        obtiendrez à la fin est une invitation à discuter — pas un audit de votre relation, pas une
        preuve, pas un verdict.
      </p>
      <p className="text-sm leading-relaxed text-cream/80">
        Vous pouvez passer une question quand vous voulez, sans pénalité. Rien de ce que vous
        répondez n’est conservé pour être relu plus tard.
      </p>

      {state === 'waiting' ? (
        <>
          <p role="status" className="text-sm text-rose">
            Vous avez accepté. En attente de {partnerName ?? PARTNER_FALLBACK}…
          </p>
          <button type="button" onClick={onRefresh} className={SECONDARY_CTA_CLASS}>
            Vérifier à nouveau
          </button>
        </>
      ) : (
        <button type="button" onClick={onAccept} disabled={accepting} className={CTA_CLASS}>
          {accepting ? 'Un instant…' : "J'accepte"}
        </button>
      )}
    </div>
  );
}
