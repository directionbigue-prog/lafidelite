'use client';

// /mot-de-passe-oublie — step 1 of password recovery, in the shared auth
// shell.
//
// `POST /api/auth/forgot-password` is enumeration-resistant on purpose: it
// answers identically whether or not the address has an account, and pads
// its latency to hide the difference. This screen must not undo that — the
// confirmation is the same either way and never hints at whether the email
// was known.
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { coupleErrorMessage } from '@/lib/couples-error-messages';
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout';
import { LoginAside } from '@/components/auth/LoginAside';
import { Field } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';

export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      // Rate limiting is the one failure worth surfacing — everything else
      // the route answers identically by design.
      setError(
        err instanceof ApiError
          ? coupleErrorMessage(err.code, err.message)
          : 'Une erreur est survenue.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout aside={<LoginAside />}>
      {sent ? (
        <div className="flex flex-col gap-6">
          <h1 className="font-serif text-[clamp(28px,5vw,36px)] leading-tight">
            Vérifiez votre email
          </h1>
          <Alert tone="success">
            Si un compte existe pour {email}, un code de réinitialisation vient d’être envoyé.
          </Alert>
          <ButtonLink href={`/reinitialiser-mot-de-passe?email=${encodeURIComponent(email)}`}>
            J’ai reçu mon code
          </ButtonLink>
          <p className="text-sm text-cream/60">
            <Link href="/connexion" className="text-gold hover:text-cream">
              Retour à la connexion
            </Link>
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="font-serif text-[clamp(28px,5vw,36px)] leading-tight">
              Mot de passe oublié
            </h1>
            <p className="text-sm text-cream/60">
              Indiquez votre email : nous vous enverrons un code pour choisir un nouveau mot de
              passe.
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
              placeholder="vous@email.com"
            />
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Envoi…' : 'Envoyer le code'}
            </Button>
          </form>

          <p className="text-sm text-cream/60">
            <Link href="/connexion" className="text-gold hover:text-cream">
              Retour à la connexion
            </Link>
          </p>
        </div>
      )}
    </AuthSplitLayout>
  );
}
