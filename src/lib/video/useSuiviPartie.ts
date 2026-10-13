'use client';

// Relire la partie quand l'autre téléphone la fait avancer.
//
// Deux déclencheurs, parce qu'aucun des deux ne suffit seul :
//   · le signal envoyé dans l'appel vidéo — instantané, mais perdu si
//     l'appel n'est pas lancé ou vient de couper ;
//   · un sondage toutes les `intervalleMs` — lent, mais il arrive toujours.
//
// Actif seulement quand `actif` est vrai (mode à distance ET écran
// concerné) : en pass-and-play, il n'y a rien à attendre de personne.
import { useEffect, useRef } from 'react';
import { useVideo } from '@/contexts/VideoContext';

export function useSuiviPartie(actif: boolean, relire: () => void, intervalleMs = 4000): void {
  const { surSignalPartie } = useVideo();
  // La dernière version de `relire` sans relancer l'effet à chaque rendu.
  const relireRef = useRef(relire);
  useEffect(() => {
    relireRef.current = relire;
  }, [relire]);

  useEffect(() => {
    if (!actif) return;
    const declencher = () => relireRef.current();
    const desabonner = surSignalPartie(declencher);
    const minuteur = setInterval(declencher, intervalleMs);
    return () => {
      desabonner();
      clearInterval(minuteur);
    };
  }, [actif, intervalleMs, surSignalPartie]);
}
