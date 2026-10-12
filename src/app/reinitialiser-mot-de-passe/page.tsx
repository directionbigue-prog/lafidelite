'use client';

// /reinitialiser-mot-de-passe — step 2 of password recovery, in the shared
// auth shell.
//
// On success the route does NOT sign the user in — it rotates the password
// and bumps tokenVersion, invalidating existing sessions. So this screen
// sends them to /connexion rather than pretending they are signed in.
import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { coupleErrorMessage } from '@/lib/couples-error-messages';
import {
  cleanVerificationCode,
  verificationCodeError,
  verificationCodeHint,
} from '@/lib/auth/verification-code';
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout';
import { LoginAside } from '@/components/auth/LoginAside';
import { Field } from '@/components/ui/Field';
import { PasswordField } from '@/components/ui/PasswordField';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState(params.get('email') ?? '');
  // Same code shape as /verify-email, so the same cleaning: a value that
  // came through a mail client carries spaces, a full stop, or a case the
  // server's regex refuses outright. See lib/auth/verification-code.ts.
  const [code, setCode] = useState(() => cleanVerificationCode(params.get('code') ?? '').code);
  const [codeHint, setCodeHint] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Before the request: a malformed code answers VALIDATION_FAILED and
    // spends one of the attempts the reset limiter allows.
    const shapeError = verificationCodeError(code);
    if (shapeError) {
      setCodeError(shapeError);
      return;
    }
    setCodeError(null);
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: { email, code, newPassword },
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? coupleErrorMessage(err.code, err.message)
          : 'Une erreur est survenue.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-[clamp(28px,5vw,36px)] leading-tight">
          Mot de passe modifié
        </h1>
        <Alert tone="success">
          Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
        </Alert>
        <Button onClick={() => router.push('/connexion')}>Se connecter</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-[clamp(28px,5vw,36px)] leading-tight">
          Nouveau mot de passe
        </h1>
        <p className="text-sm text-cream/60">
          Saisissez le code reçu par email, puis choisissez un nouveau mot de passe.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field
          label="Email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Code reçu par email"
          type="text"
          required
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          // Loose on purpose — at 8 the browser truncated a grouped paste
          // before any handler saw it. cleanVerificationCode does the cap.
          maxLength={16}
          value={code}
          onChange={(e) => {
            const entry = cleanVerificationCode(e.target.value);
            setCode(entry.code);
            setCodeHint(verificationCodeHint(entry));
            setCodeError(null);
          }}
          error={codeError}
          helper={codeHint ?? 'Huit caractères. Espaces et ponctuation sont retirés tout seuls.'}
        />
        {/* The strength meter belongs here, unlike on sign-in: the user is
            choosing a new password, which is exactly when the hint helps. */}
        <PasswordField label="Nouveau mot de passe" value={newPassword} onChange={setNewPassword} />

        {error && <Alert tone="error">{error}</Alert>}

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Modification…' : 'Changer mon mot de passe'}
        </Button>
      </form>

      <p className="text-sm text-cream/60">
        Pas encore de code ?{' '}
        <Link href="/mot-de-passe-oublie" className="text-gold hover:text-cream">
          En demander un
        </Link>
        .
      </p>
    </div>
  );
}

export default function ReinitialiserMotDePassePage() {
  return (
    <AuthSplitLayout aside={<LoginAside />}>
      {/* useSearchParams() requires a Suspense boundary under the App Router. */}
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
    </AuthSplitLayout>
  );
}
