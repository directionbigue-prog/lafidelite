'use client';

// Relire la partie quand l'autre téléphone la fait avancer.
//
// Un sondage toutes les `intervalleMs`. Il passait aussi par un signal dans
// l'appel vidéo jusqu'au 13/10/2026 ; l'appel retiré, le sondage reste le
// seul déclencheur — lent de quelques secondes, mais il arrive toujours.
//
// Actif seulement quand `actif` est vrai (mode à distance ET écran
// concerné) : en pass-and-play, il n'y a rien à attendre de personne.
import { useEffect, useRef } from 'react';

export function useSuiviPartie(actif: boolean, relire: () => void, intervalleMs = 4000): void {
  // La dernière version de `relire` sans relancer l'effet à chaque rendu.
  const relireRef = useRef(relire);
  useEffect(() => {
    relireRef.current = relire;
  }, [relire]);

  useEffect(() => {
    if (!actif) return;
    const minuteur = setInterval(() => relireRef.current(), intervalleMs);
    return () => clearInterval(minuteur);
  }, [actif, intervalleMs]);
}
