'use client';

// /jeu — the game's start screen, and the destination of the landing
// page's primary call to action.
//
// It used to be a title and one button on a black screen. That is the wrong
// welcome for the one screen a couple returns to every time they play: it
// said nothing about who they are, what they have built together, or what
// the next twelve minutes hold. It now shows their real standing — the
// cumulative score the scoring engine keeps, read from /api/couples/me —
// and what the three rounds are, taken from the same label table the
// interstitials use mid-game.
//
// The AGGREGATE only. The product's hard guardrail is that no past answer
// is ever consultable, so a running total is exactly as far as this screen
// may go: it says how the couple is doing without reopening anything either
// of them said.
//
// Every decision branch (redirect for no ACTIVE couple, disclaimer gate,
// phase-based routing, the standing card's wording) is a pure, unit-tested
// function imported from `@/lib/game/*` — this component only calls them
// and renders their result. The repo ships no jsdom, so logic left inside
// a component cannot be covered.
//
// Two failure-mode rules this screen must keep, both learned from review:
//   1. NEVER render a caught error's raw `.message` — `lib/api.ts` fills it
//      from the response body's `error` field, so that shows the user a
//      stable code like `NO_ACTIVE_COUPLE`. Always go through
//      `gameErrorMessage` / the already-translated `message`.
//   2. No terminal dead ends. This page is the game's only entry point, so
//      every non-transient state (an error, or waiting on the partner's
//      acceptance) must still offer the user an action.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import {
  coupleGateRedirect,
  interpretGamesCurrent,
  bothDisclaimersAccepted,
  disclaimerGateState,
  type CoupleMeCouple,
} from '@/lib/game/start-screen';
import {
  toGameApiSuccess,
  toGameApiFailure,
  gameErrorMessage,
  GENERIC_ERROR_MESSAGE,
} from '@/lib/game/api-result';
import { standingSummary, roundPreviews } from '@/lib/game/start-summary';
import { roundLabel, TOTAL_ROUNDS } from '@/lib/game/round-labels';
import { complicityLevelLabel } from '@/lib/game/resultats';
import { DisclaimerGate } from '@/components/game/DisclaimerGate';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { AppShell } from '@/components/app/AppShell';
import { complicityProgress } from '@/lib/game/complicity-progress';
import { dashboardGreeting } from '@/lib/game/greeting';

interface CoupleMeResponse {
  couple: CoupleMeCouple;
}

/** The standing fields `/api/couples/me` adds for an ACTIVE couple. */
interface CoupleStanding {
  cumulativeCoupleScore?: number;
  complicityLevel?: string;
  gamesPlayed?: number;
}

interface GameSessionResponse {
  id: string;
  phase: string;
}

interface DisclaimerAcceptResponse {
  acceptedByCreator: boolean;
  acceptedByPartner: boolean;
}

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'redirecting' }
  | { kind: 'gate'; gateState: 'accept' | 'waiting'; partnerName: string | null }
  | { kind: 'no-game' }
  | { kind: 'resume'; path: string }
  | { kind: 'error'; message: string };

export default function JeuStartPage() {
  const user = useUser('/connexion');
  const router = useRouter();
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [accepting, setAccepting] = useState(false);
  // Captured at load so the gate can still name the partner after an
  // accept POST, which returns only the two acceptance booleans.
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [standing, setStanding] = useState<{
    score: number;
    level: string | null;
    gamesPlayed: number;
  } | null>(null);
  // Bumping this re-runs the load effect. It is what the error state's
  // "Réessayer" and the waiting state's "Vérifier à nouveau" buttons do —
  // without it, a single failed fetch would strand the user on a screen
  // whose only escape is a browser reload.
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setState({ kind: 'loading' });
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadGameState = async () => {
      let couple: CoupleMeCouple;
      let raw: (CoupleMeResponse & { couple: CoupleStanding | null }) | null = null;
      try {
        const res = await api<CoupleMeResponse & { couple: CoupleStanding | null }>(
          '/api/couples/me',
        );
        couple = res.couple as CoupleMeCouple;
        raw = res;
      } catch (err) {
        if (!cancelled) setState({ kind: 'error', message: gameErrorMessage(err) });
        return;
      }
      if (cancelled) return;

      const redirect = coupleGateRedirect(couple);
      if (redirect) {
        setState({ kind: 'redirecting' });
        router.replace(redirect);
        return;
      }

      // Brief step 3: gate BEFORE offering to play, not after a rejected
      // POST. `disclaimerGateState` fails closed on an unknown shape, and
      // distinguishes "you still have to accept" from "you already did,
      // we're waiting on them" — a viewer who has accepted must not be
      // shown the button again on every reload.
      // A narrowed binding rather than a boolean alias: an alias does not
      // narrow the union at every use, and `disclaimerGateState` fails
      // CLOSED on an empty role — so a lost narrowing would silently show
      // the disclaimer again to a couple who had already accepted it.
      const active = couple !== null && couple.status === 'ACTIVE' ? couple : null;

      setPartnerName(active?.partnerName ?? null);
      setStanding(
        active
          ? {
              score: raw?.couple?.cumulativeCoupleScore ?? 0,
              level: raw?.couple?.complicityLevel ?? null,
              gamesPlayed: raw?.couple?.gamesPlayed ?? 0,
            }
          : null,
      );

      const gateState = disclaimerGateState(couple, active?.viewerRole ?? '');
      if (gateState !== 'none') {
        setState({
          kind: 'gate',
          gateState,
          partnerName: active?.partnerName ?? null,
        });
        return;
      }

      const result = await api<GameSessionResponse>('/api/games/current')
        .then(toGameApiSuccess)
        .catch(toGameApiFailure);
      if (cancelled) return;

      const outcome = interpretGamesCurrent(result);
      if (outcome.kind === 'no-game') setState({ kind: 'no-game' });
      else if (outcome.kind === 'resume') setState({ kind: 'resume', path: outcome.path });
      else setState({ kind: 'error', message: outcome.message });
    };

    void loadGameState();
    return () => {
      cancelled = true;
    };
  }, [user, router, reloadToken]);

  async function acceptDisclaimer() {
    setAccepting(true);
    try {
      const res = await api<DisclaimerAcceptResponse>('/api/couples/disclaimer/accept', {
        method: 'POST',
      });
      setAccepting(false);
      if (bothDisclaimersAccepted(res.acceptedByCreator, res.acceptedByPartner)) {
        // Straight to the format choice, not straight into a game.
        // Accepting the disclaimer used to create a Standard session on
        // the spot, which now means silently picking a length for a couple
        // who was never asked.
        router.push('/jeu/nouvelle');
      } else {
        setState({ kind: 'gate', gateState: 'waiting', partnerName });
      }
    } catch (err) {
      setAccepting(false);
      // Rule 1 above: translate, never render the raw ApiError message.
      setState({ kind: 'error', message: gameErrorMessage(err) });
    }
  }

  if (!user || state.kind === 'redirecting') return null;

  const summary = standing
    ? standingSummary(standing.level, standing.score, complicityLevelLabel)
    : null;
  const rounds = roundPreviews(roundLabel);

  // Safe to read the clock during render: this branch is reached only
  // after the data effect has resolved, so it never runs during the
  // server pass and cannot produce a hydration mismatch.
  const greeting = dashboardGreeting(new Date().getHours());

  // Handed to the shell so it does not fetch /api/couples/me a second time:
  // this page already asked, and that endpoint is ~3s against a remote
  // Postgres. Always a string or null, never undefined, which is what tells
  // the shell it has been supplied.
  const coupleLabel = partnerName ? `${user.name ?? 'Vous'} & ${partnerName}` : null;

  // The "52 points avant le niveau …" line. Derived from the same
  // cumulative score the card shows, so the bar and the number can never
  // disagree.
  const levelProgress = standing ? complicityProgress(standing.score) : null;

  return (
    <AppShell active="accueil" coupleLabel={coupleLabel}>
      {state.kind === 'loading' && (
        <p role="status" className="text-sm text-cream/60">
          Chargement…
        </p>
      )}

      {state.kind === 'gate' && (
        <DisclaimerGate
          state={state.gateState}
          partnerName={state.partnerName}
          accepting={accepting}
          onAccept={() => void acceptDisclaimer()}
          onRefresh={reload}
        />
      )}

      {(state.kind === 'no-game' || state.kind === 'resume') && (
        <div className="flex flex-col gap-8">
          <header>
            <p className="text-[11px] uppercase tracking-[0.16em] text-cream/50">{greeting}</p>
            <h1 className="mt-2 font-serif text-[clamp(30px,4.5vw,44px)] leading-[1.05]">
              {summary?.isFirstGame ? 'Prêts à vous découvrir ?' : 'Vous jouez ce soir ?'}
            </h1>
          </header>

          {summary && (
            <div className="grid gap-4 lg:grid-cols-3">
              {/*
                Planche 01 sets the score beside the stats rather than above
                them. The score card takes two thirds because it carries the
                number, the level and the bar; the stat is a single figure.
              */}
              <section className="rounded-3xl bg-gradient-to-br from-plum to-plum-deep2 p-6 sm:p-8 lg:col-span-2">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-cream/50">
                    {summary.isFirstGame ? 'Votre première partie' : 'Score du couple'}
                  </p>
                  {summary.levelLabel && (
                    <span className="shrink-0 rounded-full border border-rose/34 px-3 py-1 text-xs font-semibold text-rose">
                      {summary.levelLabel}
                    </span>
                  )}
                </div>

                {!summary.isFirstGame && (
                  <p className="mt-2 font-serif text-[clamp(40px,7vw,60px)] leading-none text-rose">
                    {summary.score}
                  </p>
                )}

                {/*
                Not on a first game. A couple who has never played would get
                an empty bar and "100 points avant le niveau Complices" —
                a progress indicator for progress that has not started,
                which reads as a broken component rather than a goal.
              */}
                {!summary.isFirstGame && levelProgress && levelProgress.nextLevel && (
                  <div className="mt-5">
                    {/*
                    `aria-hidden`: the sentence underneath states the same
                    thing in words, and it is the accessible source. The one
                    inline style is a runtime-computed width — Tailwind's
                    arbitrary values are resolved at build time, so a class
                    cannot express it (same call as in `GameProgress`).
                  */}
                    <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-cream/12">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-rose to-gold transition-[width] duration-700"
                        style={{ width: `${Math.round(levelProgress.fill * 100)}%` }}
                      />
                    </div>
                    <p className="mt-2.5 text-sm text-cream/60">
                      {levelProgress.pointsToNext} points avant le niveau{' '}
                      {complicityLevelLabel(levelProgress.nextLevel)}
                    </p>
                  </div>
                )}

                <p className="mt-3 text-sm leading-relaxed text-cream/60">{summary.caption}</p>
              </section>

              {/*
                Only once there is something to count. "0 parties jouées
                ensemble" next to a card already saying "Votre première
                partie" states the same nothing twice.
              */}
              {standing && standing.gamesPlayed > 0 && (
                // Centred, not top-aligned. The canvas fills this column
                // with two stacked cards; with one, stretching it to the
                // score card's height and leaving the bottom half empty
                // reads as a card that failed to load.
                <section className="flex flex-col justify-center rounded-3xl border border-cream/12 bg-plum-card p-6">
                  <p className="font-serif text-4xl leading-none text-cream">
                    {standing.gamesPlayed}
                  </p>
                  <p className="mt-2 text-sm leading-snug text-cream/60">
                    {standing.gamesPlayed === 1
                      ? 'partie jouée ensemble'
                      : 'parties jouées ensemble'}
                  </p>
                </section>
              )}
            </div>
          )}

          {/*
            Directly under the score, as in the canvas — not pinned to the
            bottom of the viewport. With a sidebar shell there is no full
            height column to pin to, and the action is above the fold here
            anyway.
          */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {state.kind === 'no-game' ? (
              // Navigates rather than creating: the format has to be chosen
              // before the questions are drawn, and the draw happens once.
              <Button onClick={() => router.push('/jeu/nouvelle')}>Nouvelle partie</Button>
            ) : (
              <>
                <Button onClick={() => router.push(state.path)}>Reprendre la partie</Button>
                <p className="text-sm text-cream/50">Elle reprend à la bonne question.</p>
              </>
            )}
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-[10px] uppercase tracking-[0.14em] text-cream/50">
              {TOTAL_ROUNDS} manches · vous choisissez la longueur
            </h2>
            <ol className="flex flex-col gap-3">
              {rounds.map((round) => (
                <li
                  key={round.num}
                  className="flex gap-4 rounded-2xl border border-cream/12 bg-plum-card p-4"
                >
                  <span className="pt-0.5 text-sm tabular-nums text-rose">{round.num}</span>
                  <span>
                    <span className="block text-[15px] font-semibold">{round.title}</span>
                    <span className="mt-1 block text-sm leading-[1.45] text-cream/60">
                      {round.rule}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="flex flex-col items-start gap-4">
          <Alert tone="error">{state.message || GENERIC_ERROR_MESSAGE}</Alert>
          <Button onClick={reload}>Réessayer</Button>
        </div>
      )}
    </AppShell>
  );
}
