'use client';

// /jeu/[id]/passe — the pass-the-device interstitial (Lot 2, Task 19).
//
// Read-only: it calls `GET /api/games/current` (which never advances a
// turn) plus `GET /api/couples/me` for the partner's name and the caller's
// side of the couple. The button leads to `/jeu/[id]/question`, and it is
// THAT page which calls `POST /start-turn` — the speed-bonus timer must
// not start while the phone is still being handed over.
//
// Who to name is decided by `passDeviceTarget`, a pure function: the
// comparison it makes is trivial to invert by accident and impossible to
// notice while testing alone on a single device.
import { useCallback, useEffect, useState } from 'react';
import { useVideo } from '@/contexts/VideoContext';
import { useSuiviPartie } from '@/lib/video/useSuiviPartie';
import { relirePartie } from '@/lib/video/relire';
import { decisionAttente } from '@/lib/video/distance';
import { BoutonAppel } from '@/components/video/BoutonAppel';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { gameErrorMessage } from '@/lib/game/api-result';
import {
  passDeviceTarget,
  passDeviceHeading,
  passDeviceInitial,
  passDeviceCtaLabel,
  type PassDeviceTarget,
} from '@/lib/game/pass-device';
import { gameProgress } from '@/lib/game/progress';
import { guardPhase } from '@/lib/game/phase-routes';
import { buttonClass } from '@/components/ui/Button';
import { FocusLayout } from '@/components/ui/FocusLayout';

interface CurrentGameSessionResponse {
  id: string;
  currentRoundNumber: number;
  currentQuestionNumber: number;
  activePlayerRole: string;
  phase: string;
  questionsPerRound: number[];
}

interface CoupleMeResponse {
  couple: {
    status: string;
    partnerName: string | null;
    viewerRole?: string;
  } | null;
}

type ScreenState =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      // The id the server just told us is the couple's IN_PROGRESS
      // session — NOT the `[id]` route param. A stale tab or an old
      // deep-link would otherwise carry a finished game's id forward.
      sessionId: string;
      target: Exclude<PassDeviceTarget, { kind: 'unknown' }>;
      /** CREATOR | PARTNER — pour savoir, à distance, si le tour est le mien. */
      viewerRole: string;
      /** The letter in the tile — null when no name is on file. */
      initial: string | null;
      roundNumber: number;
      questionNumber: number;
      questionsPerRound: number[];
    }
  | { kind: 'error'; message: string };

// An unattributable turn is a blocked state, not a cosmetic one: sending
// the phone to the wrong person is worse than stopping. The heading alone
// is not enough — the CTA must go too.
const UNKNOWN_TURN_MESSAGE =
  'Impossible de savoir à qui est le tour. Revenez à l’accueil du jeu pour reprendre la partie.';

const CTA_CLASS = buttonClass('primary');

export default function PassePage() {
  const user = useUser('/connexion');
  const router = useRouter();
  // The `[id]` route param is deliberately NOT read: the couple has at
  // most one IN_PROGRESS session, and `GET /api/games/current` is the
  // authority on which one it is. Navigating on the fetched id keeps a
  // stale tab from carrying a finished game's id into the next screen.
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const video = useVideo();
  // Incrémenté pour relire la partie quand elle a avancé à distance.
  const [jeton, setJeton] = useState(0);
  const [surCeTelephone, setSurCeTelephone] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void (async () => {
      try {
        const [session, me] = await Promise.all([
          api<CurrentGameSessionResponse>('/api/games/current'),
          api<CoupleMeResponse>('/api/couples/me'),
        ]);
        if (cancelled) return;

        // Boot guard: without it, a Back button from a later screen shows
        // a hand-over prompt for a turn that has already been played.
        // ANSWERING is allowed alongside PASS_DEVICE because a player who
        // reloads mid-turn legitimately lands back here before /question
        // re-stamps nothing (start-turn is idempotent while ANSWERING).
        const guard = guardPhase(session.id, session.phase, ['PASS_DEVICE', 'ANSWERING']);
        if (guard.kind === 'redirect') {
          router.replace(guard.path);
          return;
        }
        if (guard.kind === 'error') {
          setState({ kind: 'error', message: UNKNOWN_TURN_MESSAGE });
          return;
        }

        const target = passDeviceTarget(
          session.activePlayerRole,
          me.couple?.viewerRole ?? '',
          me.couple?.partnerName ?? null,
        );
        if (target.kind === 'unknown') {
          setState({ kind: 'error', message: UNKNOWN_TURN_MESSAGE });
          return;
        }
        setState({
          kind: 'ready',
          sessionId: session.id,
          target,
          viewerRole: me.couple?.viewerRole ?? '',
          initial: passDeviceInitial(target, user.name ?? null),
          roundNumber: session.currentRoundNumber,
          questionNumber: session.currentQuestionNumber,
          questionsPerRound: session.questionsPerRound,
        });
      } catch (err) {
        if (!cancelled) setState({ kind: 'error', message: gameErrorMessage(err) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, router, jeton]);

  // ── Mode à distance ─────────────────────────────────────────────────
  // Le tour est à l'autre, qui joue sur SON téléphone : on n'a rien à lui
  // passer. Cet écran attend et suit la partie (voir lib/video/distance.ts).
  // « Nous jouons sur ce téléphone » ramène au pass-and-play pour cet écran,
  // pour le couple qui garde la vidéo allumée en étant côte à côte.
  const enAttente =
    video.modeDistance &&
    !surCeTelephone &&
    state.kind === 'ready' &&
    state.target.kind === 'partner';
  const viewerRole = state.kind === 'ready' ? state.viewerRole : '';
  const relecture = useCallback(() => {
    relirePartie()
      .then((lu) => {
        const d = decisionAttente(lu, viewerRole);
        if (d.kind === 'a-toi') setJeton((n) => n + 1);
        else if (d.kind === 'aller') router.replace(d.path);
      })
      // Une relecture ratée n'est pas grave : la suivante arrive dans 4 s.
      .catch(() => undefined);
  }, [viewerRole, router]);
  useSuiviPartie(enAttente, relecture);

  if (!user) return null;

  const progress =
    state.kind === 'ready'
      ? gameProgress(
          {
            kind: 'question',
            roundNumber: state.roundNumber,
            questionNumber: state.questionNumber,
          },
          state.questionsPerRound,
        )
      : null;

  return (
    /*
      Wine, edge to edge, and nothing else on it. This is the one screen in
      the game whose job is to be noticed from across a room: the phone is
      changing hands, and a couple who miss that read each other's answers.
      The canvas makes the whole field the signal — no card, no bar, no
      chrome competing with the name.
    */
    <FocusLayout ground={state.kind === 'ready' ? 'wine' : 'ink'} centerText>
      {state.kind === 'loading' && (
        <p role="status" className="text-sm text-cream/60">
          Chargement…
        </p>
      )}

      {state.kind === 'ready' && enAttente && (
        <>
          {state.initial !== null && (
            <span
              aria-hidden
              className="flex h-[74px] w-[74px] animate-pulse items-center justify-center rounded-[26px] border border-cream/28 bg-cream/16 font-serif text-[32px] leading-none"
            >
              {state.initial}
            </span>
          )}
          <h1 className="mt-1 max-w-xs font-serif text-[36px] leading-[1.06]">
            {state.target.kind === 'partner' && state.target.partnerName
              ? `${state.target.partnerName} répond…`
              : 'Votre partenaire répond…'}
          </h1>
          <p role="status" className="max-w-xs text-[16px] leading-relaxed text-cream/85">
            Sur son téléphone. Cet écran avance tout seul dès que c’est à vous — et personne ne voit
            la réponse de l’autre avant la fin de la manche.
          </p>
          <BoutonAppel libelle="Se voir pendant la partie" />
          <button
            type="button"
            onClick={() => setSurCeTelephone(true)}
            className={buttonClass('ghost')}
          >
            Nous jouons sur ce téléphone
          </button>
          {progress && <p className="text-sm text-cream/65">{progress.label}</p>}
        </>
      )}

      {state.kind === 'ready' && !enAttente && (
        <>
          {state.initial !== null && (
            /*
              Decorative: it stands in for a face this product does not
              have. The name is spelled out immediately below, so
              announcing a lone letter would only add noise.
            */
            <span
              aria-hidden
              className="flex h-[74px] w-[74px] items-center justify-center rounded-[26px] border border-cream/28 bg-cream/16 font-serif text-[32px] leading-none"
            >
              {state.initial}
            </span>
          )}

          <h1 className="mt-1 max-w-xs font-serif text-[36px] leading-[1.06]">
            {passDeviceHeading(state.target)}
          </h1>

          <p className="max-w-xs text-[16px] leading-relaxed text-cream/85">
            {state.target.kind === 'self'
              ? 'Ton écran est masqué pour l’autre : personne ne voit ta réponse avant la fin de la manche.'
              : 'Son écran est masqué. Personne ne voit la réponse de l’autre avant la fin de la manche.'}
          </p>

          {/*
            Cream would be the canvas's fill here. It stays gold: the
            platform has one action colour, and a second one introduced for
            a single screen is exactly the drift the button primitive was
            written to stop. Gold on wine is the same warm pairing the
            canvas uses for every other call to action.
          */}
          <button
            type="button"
            onClick={() => router.push(`/jeu/${state.sessionId}/question`)}
            className={buttonClass('primary', true)}
          >
            {passDeviceCtaLabel(state.target)}
          </button>

          {progress && <p className="text-sm text-cream/65">{progress.label}</p>}
        </>
      )}

      {state.kind === 'error' && (
        <>
          <p role="alert" className="text-sm text-rose">
            {state.message}
          </p>
          <button type="button" onClick={() => router.push('/jeu')} className={CTA_CLASS}>
            Retour à l’accueil du jeu
          </button>
        </>
      )}
    </FocusLayout>
  );
}
