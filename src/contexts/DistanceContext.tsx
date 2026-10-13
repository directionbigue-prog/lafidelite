'use client';

// Le jeu à distance : chaque partenaire sur son propre téléphone.
//
// Un interrupteur par appareil, mémorisé en localStorage — une préférence
// d'appareil, pas un état partagé : son absence (navigation privée) ramène
// simplement au pass-and-play, le mode par défaut. Ce qui change à l'écran
// quand il est actif vit dans `lib/distance/distance.ts`.
//
// Ce contexte remplace `VideoContext` (13/10/2026) : l'appel vidéo a été
// retiré du produit, et le mode à distance — qui en dépendait — ne garde que
// ce dont il a besoin.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const CLE_DISTANCE = 'cf-mode-distance';

interface DistanceContextValue {
  /** Vrai si cet appareil a choisi le jeu à distance. */
  modeDistance: boolean;
  setModeDistance: (v: boolean) => void;
}

const DistanceContext = createContext<DistanceContextValue | null>(null);

export function DistanceProvider({ children }: { children: ReactNode }) {
  const [modeDistance, setEtat] = useState(false);

  useEffect(() => {
    try {
      setEtat(window.localStorage.getItem(CLE_DISTANCE) === '1');
    } catch {
      /* stockage indisponible */
    }
  }, []);

  const setModeDistance = useCallback((v: boolean) => {
    setEtat(v);
    try {
      window.localStorage.setItem(CLE_DISTANCE, v ? '1' : '0');
    } catch {
      /* stockage indisponible */
    }
  }, []);

  const valeur = useMemo(
    () => ({ modeDistance, setModeDistance }),
    [modeDistance, setModeDistance],
  );
  return <DistanceContext.Provider value={valeur}>{children}</DistanceContext.Provider>;
}

export function useDistance(): DistanceContextValue {
  const v = useContext(DistanceContext);
  if (!v) throw new Error('useDistance doit être utilisé sous <DistanceProvider>');
  return v;
}
