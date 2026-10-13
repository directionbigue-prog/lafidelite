// /connexion — sign in, sharing the signup canvas's split layout.
//
// Server component for the same reason as /inscription: whether the Google
// button may be rendered is a server fact, decided by the same
// `tryCreateGoogleProvider()` predicate the OAuth route uses, so the button
// and the endpoint cannot disagree.
export const runtime = 'nodejs';

import { tryCreateGoogleProvider } from '@/lib/server/oauth/google';
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout';
import { LoginAside } from '@/components/auth/LoginAside';
import { LoginForm } from './LoginForm';
import type { Metadata } from 'next';
import { metadataDePage } from '@/lib/seo/pages';

// Titre, description et canonique viennent du registre, jamais d'ici : c'est
// lui qui alimente aussi le sitemap, donc les deux ne peuvent pas diverger.
export const metadata: Metadata = metadataDePage('/connexion');

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const googleEnabled = tryCreateGoogleProvider() !== undefined;
  // `?next=` — posé par /acheter/[pack] pour revenir ouvrir le paiement.
  const brut = (await searchParams).next;
  const next = (Array.isArray(brut) ? brut[0] : brut) ?? null;

  return (
    <AuthSplitLayout aside={<LoginAside />}>
      <LoginForm googleEnabled={googleEnabled} next={next} />
    </AuthSplitLayout>
  );
}
