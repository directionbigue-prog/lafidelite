'use client';

// The signup form itself — the right-hand column of the canvas, and the
// whole of the mobile artboard.
//
// `googleEnabled` is decided on the server (see page.tsx) rather than here:
// `/api/auth/oauth/google/start` answers 404 when GOOGLE_CLIENT_ID /
// GOOGLE_CLIENT_SECRET are unset, so rendering the provider button
// unconditionally would put a dead button at the top of the primary form.
//
// The heading changes when an invitation resolves ("Rejoignez <Prénom>"),
// matching the third artboard, but the form beneath is the same form — the
// invite only rides along as `inviteCode` in the signup body.
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { coupleErrorMessage } from '@/lib/couples-error-messages';
import { Field } from '@/components/ui/Field';
import { PasswordField } from '@/components/ui/PasswordField';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { InviteBanner, inviteCreatorName, type InviteState } from '@/components/auth/InviteBanner';

interface InviteInfo {
  valid: boolean;
  creatorName?: string;
  expired?: boolean;
}

export function SignupForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get('invite');

  // `?email=` vient de la carte d’accueil, qui soumet un GET vers cette
  // page. Sans ce pré-remplissage, le visiteur saisirait son adresse deux
  // fois et la première saisie n’aurait servi à rien.
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [invite, setInvite] = useState<InviteState>(
    inviteCode ? { kind: 'loading' } : { kind: 'none' },
  );

  useEffect(() => {
    if (!inviteCode) return;
    let cancelled = false;

    api<InviteInfo>(`/api/invites/${encodeURIComponent(inviteCode)}`)
      .then((res) => {
        if (cancelled) return;
        setInvite(
          res.valid
            ? { kind: 'valid', creatorName: res.creatorName ?? null }
            : { kind: 'invalid', expired: res.expired === true },
        );
      })
      .catch(() => {
        // A lookup that fails is not a reason to block signing up — the
        // code simply does not ride along, and pairing happens by code
        // afterwards.
        if (!cancelled) setInvite({ kind: 'invalid', expired: false });
      });

    return () => {
      cancelled = true;
    };
  }, [inviteCode]);

  const creatorName = inviteCreatorName(invite);
  const inviteIsUsable = invite.kind === 'valid';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/signup', {
        method: 'POST',
        body: {
          email,
          password,
          name,
          // Only sent once the invite resolved as usable: passing an
          // expired or unknown code would fail a signup that should
          // succeed without it.
          ...(inviteCode && inviteIsUsable ? { inviteCode } : {}),
        },
      });
      // Signup issues no cookies by design — /verify-email is what signs
      // the user in, once they enter the emailed code.
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
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

  const nextAfterOAuth = inviteCode ? `/invite/${inviteCode}` : '/jeu';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-[clamp(28px,5vw,36px)] leading-tight">
          {creatorName ? `Rejoignez ${creatorName}` : 'Créer votre compte'}
        </h1>
        <p className="text-sm text-cream/60">
          Déjà un compte ?{' '}
          <Link href="/connexion" className="font-semibold text-gold hover:text-cream">
            Se connecter
          </Link>
        </p>
      </header>

      <InviteBanner state={invite} />

      {googleEnabled && (
        <>
          <GoogleButton next={nextAfterOAuth} />
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
          label="Prénom"
          type="text"
          required
          autoComplete="given-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          helper="C’est ce que verra votre partenaire."
        />
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
        <PasswordField label="Mot de passe" value={password} onChange={setPassword} />

        {error && <Alert tone="error">{error}</Alert>}

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Création…' : creatorName ? `Rejoindre ${creatorName}` : 'Créer mon compte'}
        </Button>
      </form>

      {/*
        Plain text, not links: the terms and privacy pages do not exist yet
        (README, "Limites connues"). A link to `#` here would be the same
        dead affordance that was just removed from the footer.
      */}
      <p className="text-xs leading-relaxed text-cream/45">
        En créant votre compte, vous acceptez les conditions d’utilisation et la politique de
        confidentialité de Cœur Fidèle. Réservé aux 18 ans et plus.
      </p>
    </div>
  );
}
