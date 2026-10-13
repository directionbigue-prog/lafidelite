'use client';

// The sign-in form — same primitives and layout as signup, per the canvas.
//
// The password field here is a plain `Field`, NOT the signup one: a
// strength meter on an existing password is noise at best, and at worst it
// tells someone their real password is "Faible" while they are simply
// trying to get in. Only the show/hide toggle carries over, which is what
// helps on a phone keyboard.
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { coupleErrorMessage } from '@/lib/couples-error-messages';
import { Field } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { ComptesAppareil } from '@/components/auth/ComptesAppareil';

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      // `/jeu` resolves every couple state itself (no couple ->
      // /couple/creer, PENDING -> /couple/attente, ACTIVE -> the game), so
      // a returning couple lands on the game rather than on a setup screen
      // they finished weeks ago.
      router.push('/jeu');
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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-[clamp(28px,5vw,36px)] leading-tight">Se connecter</h1>
        <p className="text-sm text-cream/60">
          Pas encore de compte ?{' '}
          <Link href="/inscription" className="font-semibold text-gold hover:text-cream">
            Créer un compte
          </Link>
        </p>
      </header>

      {/* Les comptes déjà ouverts sur cet appareil : un clic, sans mot de
          passe. Ne rend rien quand il n'y en a pas. */}
      <ComptesAppareil mode="connexion" />

      {googleEnabled && (
        <>
          <GoogleButton next="/jeu" />
          <div className="flex items-center gap-4" aria-hidden>
            <span className="h-px flex-1 bg-cream/14" />
            <span className="text-[11px] uppercase tracking-[0.14em] text-cream/40">
              ou par email
            </span>
            <span className="h-px flex-1 bg-cream/14" />
          </div>
        </>
      )}

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
        <Field
          label="Mot de passe"
          type={visible ? 'text' : 'password'}
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          trailing={
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-pressed={visible}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-cream/60 transition-colors hover:text-gold"
            >
              {visible ? 'Masquer' : 'Voir'}
            </button>
          }
        />

        {error && <Alert tone="error">{error}</Alert>}

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>

      <p className="text-sm text-cream/60">
        <Link href="/mot-de-passe-oublie" className="text-gold hover:text-cream">
          Mot de passe oublié ?
        </Link>
      </p>
    </div>
  );
}
