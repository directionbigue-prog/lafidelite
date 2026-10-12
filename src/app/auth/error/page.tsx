// /auth/error — landing page for OAuth callback failures.
//
// The callback (src/app/api/auth/oauth/google/callback/route.ts)
// builds redirects via `redirectToAuthError(code)` in
// src/lib/server/oauth/error-redirect.ts. That helper hard-codes
// `/auth/error?code=<CODE>` with five UPPERCASE codes (D-06 contract):
//   GOOGLE_EMAIL_NOT_VERIFIED
//   OAUTH_STATE_MISMATCH
//   OAUTH_CODE_EXCHANGE_FAILED
//   OAUTH_PROVIDER_DISABLED
//   OAUTH_GENERIC
//
// Unknown / missing codes fall back to a generic message.
'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/Button';
import { FocusLayout } from '@/components/ui/FocusLayout';
import { useSearchParams } from 'next/navigation';

const ERROR_MESSAGES: Record<string, string> = {
  GOOGLE_EMAIL_NOT_VERIFIED:
    "Votre adresse Google n'est pas vérifiée. Vérifiez-la sur votre compte Google, puis réessayez.",
  OAUTH_STATE_MISMATCH:
    'La connexion a été interrompue (vérification de sécurité). Cela peut arriver si la page Google est restée ouverte trop longtemps — réessayez.',
  OAUTH_CODE_EXCHANGE_FAILED: 'Google a refusé la connexion. Réessayez dans un instant.',
  OAUTH_PROVIDER_DISABLED:
    'La connexion via Google n’est pas activée sur ce serveur. Contactez le support.',
  OAUTH_GENERIC: 'Une erreur inattendue est survenue pendant la connexion. Réessayez.',
};

function AuthErrorBody() {
  const params = useSearchParams();
  const code = params.get('code') ?? params.get('error') ?? '';
  const normalized = code.toUpperCase();
  const message =
    ERROR_MESSAGES[normalized] ??
    'Une erreur inconnue est survenue pendant la connexion. Réessayez.';

  return (
    <FocusLayout>
      <h1 className="font-serif text-3xl">Échec de connexion</h1>
      <p className="text-sm text-cream/70">{message}</p>
      {code && <p className="font-mono text-xs text-cream/40">code: {code}</p>}
      <div className="flex flex-col gap-2">
        <Link href="/connexion" className={buttonClass()}>
          Retour à la connexion
        </Link>
        <Link href="/" className="text-center text-sm text-cream/60 underline">
          Accueil
        </Link>
      </div>
    </FocusLayout>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={null}>
      <AuthErrorBody />
    </Suspense>
  );
}
