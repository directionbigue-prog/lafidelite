// /verify-email — step 1 of onboarding, in the shared auth shell.
export const runtime = 'nodejs';

import { Suspense } from 'react';
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout';
import { OnboardingAside } from '@/components/auth/OnboardingAside';
import { VerifyEmailForm } from './VerifyEmailForm';

export default function VerifyEmailPage() {
  return (
    <AuthSplitLayout
      aside={
        <OnboardingAside
          current="verify"
          title="Plus qu’une étape avant de jouer."
          intro="On vérifie votre email une seule fois, pour que votre partenaire soit sûr de rejoindre la bonne personne."
        />
      }
    >
      {/* useSearchParams() requires a Suspense boundary under the App Router. */}
      <Suspense fallback={null}>
        <VerifyEmailForm />
      </Suspense>
    </AuthSplitLayout>
  );
}
