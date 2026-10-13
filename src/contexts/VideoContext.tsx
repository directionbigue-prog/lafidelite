'use client';

// L'appel vidéo du couple — UN appel pour toute l'application.
//
// Monté dans le layout racine pour survivre aux navigations : la partie
// enchaîne cinq écrans (/passe, /question, /manche-revelee…), et un appel
// rattaché à une page se couperait à chaque changement d'écran. Ici il vit
// au-dessus des pages, et la fenêtre vidéo flotte par-dessus.
//
// La bibliothèque Daily est chargée À LA DEMANDE (`import()` au premier
// appel) : la quasi-totalité des visites n'appellent jamais, et ~200 Ko de
// WebRTC ne doivent pas peser sur la page d'accueil.
//
// LE MODE À DISTANCE. Pendant un appel, les deux partenaires sont par
// définition sur deux téléphones : les écrans de jeu passent en mode
// « chacun son téléphone » (voir `lib/video/distance.ts`). Un interrupteur
// manuel (mémorisé sur cet appareil) permet aussi de jouer à distance sans
// vidéo, ou de garder la vidéo en jouant sur un seul téléphone.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { DailyCall } from '@daily-co/daily-js';
import { api } from '@/lib/api';
import { gameErrorMessage } from '@/lib/game/api-result';
import { pistesDepuis, type ParticipantBrut, type Pistes } from '@/lib/video/pistes';
import { estSignalPartie, SIGNAL_PARTIE } from '@/lib/video/distance';

export type StatutAppel = 'inactif' | 'connexion' | 'en-appel' | 'erreur';

interface VideoContextValue {
  statut: StatutAppel;
  erreur: string | null;
  pistes: Pistes<MediaStreamTrack>;
  microActif: boolean;
  cameraActive: boolean;
  /** Vrai pendant un appel, ou si l'appareil a choisi le jeu à distance. */
  modeDistance: boolean;
  distanceManuelle: boolean;
  demarrer: () => Promise<void>;
  quitter: () => Promise<void>;
  basculerMicro: () => void;
  basculerCamera: () => void;
  setDistanceManuelle: (v: boolean) => void;
  /** Prévenir l'autre téléphone que la partie vient d'avancer. */
  signalerPartie: () => void;
  /** S'abonner aux signaux de l'autre téléphone. Rend le désabonnement. */
  surSignalPartie: (cb: () => void) => () => void;
}

const PISTES_VIDES: Pistes<MediaStreamTrack> = {
  maVideo: null,
  saVideo: null,
  sonAudio: null,
  partenairePresent: false,
  nomPartenaire: null,
};

const CLE_DISTANCE = 'cf-mode-distance';

const VideoContext = createContext<VideoContextValue | null>(null);

export function VideoProvider({ children }: { children: ReactNode }) {
  const appelRef = useRef<DailyCall | null>(null);
  const abonnesRef = useRef(new Set<() => void>());
  const [statut, setStatut] = useState<StatutAppel>('inactif');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pistes, setPistes] = useState<Pistes<MediaStreamTrack>>(PISTES_VIDES);
  const [microActif, setMicroActif] = useState(true);
  const [cameraActive, setCameraActive] = useState(true);
  const [distanceManuelle, setDistanceManuelleEtat] = useState(false);

  // Préférence d'appareil, pas d'état partagé : localStorage suffit, et son
  // absence (navigation privée) ramène simplement au pass-and-play.
  useEffect(() => {
    try {
      setDistanceManuelleEtat(window.localStorage.getItem(CLE_DISTANCE) === '1');
    } catch {
      /* stockage indisponible */
    }
  }, []);

  const setDistanceManuelle = useCallback((v: boolean) => {
    setDistanceManuelleEtat(v);
    try {
      window.localStorage.setItem(CLE_DISTANCE, v ? '1' : '0');
    } catch {
      /* stockage indisponible */
    }
  }, []);

  const relirePistes = useCallback(() => {
    const appel = appelRef.current;
    if (!appel) return;
    setPistes(
      pistesDepuis<MediaStreamTrack>(
        appel.participants() as unknown as Record<string, ParticipantBrut>,
      ),
    );
  }, []);

  const nettoyer = useCallback(async () => {
    const appel = appelRef.current;
    appelRef.current = null;
    if (appel) {
      try {
        await appel.leave();
      } catch {
        /* déjà sorti */
      }
      try {
        await appel.destroy();
      } catch {
        /* déjà détruit */
      }
    }
    setPistes(PISTES_VIDES);
  }, []);

  const demarrer = useCallback(async () => {
    if (appelRef.current) return;
    setErreur(null);
    setStatut('connexion');
    try {
      const { url, token } = await api<{ url: string; token: string }>('/api/video/jeton', {
        method: 'POST',
      });
      const Daily = (await import('@daily-co/daily-js')).default;
      const appel = Daily.createCallObject({ subscribeToTracksAutomatically: true });
      appelRef.current = appel;

      const evenements = [
        'participant-joined',
        'participant-updated',
        'participant-left',
        'track-started',
        'track-stopped',
      ] as const;
      for (const e of evenements) appel.on(e, relirePistes);
      appel.on('app-message', (ev) => {
        if (estSignalPartie(ev?.data)) for (const cb of abonnesRef.current) cb();
      });
      appel.on('left-meeting', () => {
        setStatut('inactif');
        void nettoyer();
      });
      appel.on('error', (ev) => {
        setErreur(
          ev?.errorMsg
            ? 'L’appel a été interrompu. Vérifiez votre connexion et relancez-le.'
            : 'L’appel a été interrompu.',
        );
        setStatut('erreur');
        void nettoyer();
      });

      await appel.join({ url, token });
      setMicroActif(appel.localAudio());
      setCameraActive(appel.localVideo());
      setStatut('en-appel');
      relirePistes();
    } catch (err) {
      setErreur(
        err instanceof Error && /permission|NotAllowed/i.test(err.message)
          ? 'Autorisez la caméra et le micro dans votre navigateur pour lancer l’appel.'
          : gameErrorMessage(err),
      );
      setStatut('erreur');
      await nettoyer();
    }
  }, [nettoyer, relirePistes]);

  const quitter = useCallback(async () => {
    await nettoyer();
    setStatut('inactif');
    setErreur(null);
  }, [nettoyer]);

  const basculerMicro = useCallback(() => {
    const appel = appelRef.current;
    if (!appel) return;
    const v = !appel.localAudio();
    appel.setLocalAudio(v);
    setMicroActif(v);
  }, []);

  const basculerCamera = useCallback(() => {
    const appel = appelRef.current;
    if (!appel) return;
    const v = !appel.localVideo();
    appel.setLocalVideo(v);
    setCameraActive(v);
  }, []);

  const signalerPartie = useCallback(() => {
    try {
      appelRef.current?.sendAppMessage({ type: SIGNAL_PARTIE }, '*');
    } catch {
      /* hors appel : le sondage de l'autre téléphone prendra le relais */
    }
  }, []);

  const surSignalPartie = useCallback((cb: () => void) => {
    abonnesRef.current.add(cb);
    return () => {
      abonnesRef.current.delete(cb);
    };
  }, []);

  // Quitter proprement si l'onglet se ferme : sinon le partenaire voit une
  // vignette figée jusqu'à ce que Daily constate la coupure.
  useEffect(() => {
    const fermer = () => {
      void appelRef.current?.leave();
    };
    window.addEventListener('pagehide', fermer);
    return () => window.removeEventListener('pagehide', fermer);
  }, []);

  const valeur = useMemo<VideoContextValue>(
    () => ({
      statut,
      erreur,
      pistes,
      microActif,
      cameraActive,
      modeDistance: statut === 'en-appel' || distanceManuelle,
      distanceManuelle,
      demarrer,
      quitter,
      basculerMicro,
      basculerCamera,
      setDistanceManuelle,
      signalerPartie,
      surSignalPartie,
    }),
    [
      statut,
      erreur,
      pistes,
      microActif,
      cameraActive,
      distanceManuelle,
      demarrer,
      quitter,
      basculerMicro,
      basculerCamera,
      setDistanceManuelle,
      signalerPartie,
      surSignalPartie,
    ],
  );

  return <VideoContext.Provider value={valeur}>{children}</VideoContext.Provider>;
}

export function useVideo(): VideoContextValue {
  const v = useContext(VideoContext);
  if (!v) throw new Error('useVideo doit être utilisé sous <VideoProvider>');
  return v;
}
