// /inscription — signup, from the design canvas.
//
// A SERVER component wrapping the client form, for one reason: whether
// "Continuer avec Google" may be shown is a server fact. `/api/auth/oauth/
// google/start` answers 404 when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
// are unset (the starter's documented "inert provider" pattern), so a
// button rendered unconditionally would sit at the top of the primary form
// and lead nowhere.
//
// `tryCreateGoogleProvider()` is the same predicate the route itself uses —
// called here rather than re-derived from env vars, so the button and the
// endpoint can never disagree about whether Google is configured.
export const runtime = 'nodejs';

import { Suspense } from 'react';
import { tryCreateGoogleProvider } from '@/lib/server/oauth/google';
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout';
import { SignupAside } from '@/components/auth/SignupAside';
import { SignupForm } from './SignupForm';
import type { Metadata } from 'next';
import { metadataDePage } from '@/lib/seo/pages';

// Titre, description et canonique viennent du registre, jamais d'ici : c'est
// lui qui alimente aussi le sitemap, donc les deux ne peuvent pas diverger.
export const metadata: Metadata = metadataDePage('/inscription');

export default function InscriptionPage() {
  const googleEnabled = tryCreateGoogleProvider() !== undefined;

  return (
    <AuthSplitLayout aside={<SignupAside />}>
      {/* useSearchParams() (the `?invite=` code) requires a Suspense boundary.
          Its fallback is what the server sends, so it carries the page's h1:
          with `null` the HTML had no heading at all — nothing for a crawler
          that does not run the script. */}
      <Suspense
        fallback={
          <h1 className="font-serif text-[clamp(28px,5vw,36px)] leading-tight">
            Créer votre compte
          </h1>
        }
      >
        <SignupForm googleEnabled={googleEnabled} />
      </Suspense>
    </AuthSplitLayout>
  );
}
