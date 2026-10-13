'use client';

// L'écran d'erreur de l'application, quand un écran plante au rendu.
//
// Réécrit le 13/10/2026 : la version héritée du starter était en anglais,
// hors charte (gris et noir écrits à la main) et affichait `error.message`
// brut — un détail technique, parfois une requête ou un chemin, montré à un
// joueur. On envoie l'erreur à Sentry, on montre une phrase et deux sorties.
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { FocusLayout } from '@/components/ui/FocusLayout';
import { Button, ButtonLink } from '@/components/ui/Button';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <FocusLayout centerText>
      <h1 className="font-serif text-[clamp(28px,5vw,36px)] leading-tight">Un souci est survenu</h1>
      <p className="text-cream/70">
        L’écran n’a pas pu s’afficher. Réessayez ; si cela recommence, revenez à l’accueil.
      </p>
      {error.digest && <p className="text-xs text-cream/40">Référence : {error.digest}</p>}
      <div className="flex flex-col gap-3">
        <Button onClick={reset}>Réessayer</Button>
        <ButtonLink href="/jeu" variant="ghost">
          Retour à l’accueil
        </ButtonLink>
      </div>
    </FocusLayout>
  );
}
