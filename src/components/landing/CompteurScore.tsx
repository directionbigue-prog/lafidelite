'use client';

// Le score qui monte sur le téléphone de fin de partie, dans le héros de
// l'accueil. La règle (durées, courbe, boucle) vit dans `lib/landing/compteur.ts`.
//
// Le rendu serveur affiche la valeur FINALE : sans JavaScript, ou quand le
// visiteur a demandé moins d'animations, le chiffre est juste et immobile.
// La boucle ne tourne que tant que le compteur est à l'écran : un tic toutes
// les 100 ms sur une page qu'on a fait défiler ne coûterait que de la batterie.
import { useEffect, useRef, useState } from 'react';
import { DUREE_DU_TIC_MS, valeurAuTic } from '@/lib/landing/compteur';

export function CompteurScore({ cible, prefixe = '' }: { cible: number; prefixe?: string }) {
  const [valeur, setValeur] = useState(cible);
  const element = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = element.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let tic = 0;
    let minuterie: ReturnType<typeof setInterval> | null = null;
    const arreter = () => {
      if (minuterie) clearInterval(minuterie);
      minuterie = null;
    };

    const observateur = new IntersectionObserver(([entree]) => {
      if (!entree?.isIntersecting) return arreter();
      if (minuterie) return;
      tic = 0;
      setValeur(valeurAuTic(cible, tic));
      minuterie = setInterval(() => {
        tic += 1;
        setValeur(valeurAuTic(cible, tic));
      }, DUREE_DU_TIC_MS);
    });
    observateur.observe(el);

    return () => {
      observateur.disconnect();
      arreter();
    };
  }, [cible]);

  return (
    <span ref={element}>
      {prefixe}
      {valeur}
    </span>
  );
}
