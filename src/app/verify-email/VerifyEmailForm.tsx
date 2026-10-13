'use client';

// Step 1 of onboarding: the emailed code. Signup issues no cookies — this
// screen is what actually signs the user in.
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { coupleErrorMessage } from '@/lib/couples-error-messages';
import {
  cleanVerificationCode,
  verificationCodeError,
  verificationCodeHint,
} from '@/lib/auth/verification-code';
import { Field } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { MESSAGE_RENVOI, PISTES_SI_RIEN_NE_VIENT } from '@/lib/auth/verification-renvoi';
import { destinationApresConnexion, packChoisiMemorise } from '@/lib/game/pack-choisi';

export function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState(params.get('email') ?? '');
  // Cleaned on the way in too: a code arriving by query string has been
  // through a mail client, and can carry the same noise as a paste.
  const [code, setCode] = useState(() => cleanVerificationCode(params.get('code') ?? '').code);
  const [codeHint, setCodeHint] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  // If both query params are present (user clicked the link), submit
  // automatically — the form is just a fallback for manual entry.
  useEffect(() => {
    const qEmail = params.get('email');
    const qCode = cleanVerificationCode(params.get('code') ?? '').code;
    // A link carrying a half-copied code must not spend one of the five
    // attempts allowed per quarter-hour — leave it in the field instead.
    if (qEmail && qCode && !verificationCodeError(qCode)) {
      void verify(qEmail, qCode);
    }
    // Deliberately runs once on mount — verify() itself is stable enough
    // for this fire-once auto-submit use case.
  }, []);

  async function verify(emailValue: string, codeValue: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/verify-email', {
        method: 'POST',
        body: { email: emailValue, code: codeValue },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      // `/jeu` rather than `/couple/creer`: it resolves every couple state
      // itself, which matters here because signing up through an invite
      // link pairs the user during signup — sending them to "create your
      // Espace Couple" would show a screen they are already past. A pack
      // chosen before signing up (`?next=`, or the local memory of /acheter
      // when the emailed link dropped it) opens its payment instead.
      router.push(destinationApresConnexion(params.get('next'), packChoisiMemorise()));
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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Shape-checked here, not left to the server: a malformed code answers
    // VALIDATION_FAILED — "Le formulaire contient une erreur.", which says
    // nothing — and burns one of five attempts per quarter-hour.
    const shapeError = verificationCodeError(code);
    if (shapeError) {
      setCodeError(shapeError);
      return;
    }
    setCodeError(null);
    void verify(email, code);
  }

  // `/api/auth/resend-verification` shipped with no caller: a user whose
  // code never arrived was told to "sign up again" instead, which is not
  // what re-registering an existing address does.
  async function resend() {
    if (!email) {
      setError('Renseignez votre email pour recevoir un nouveau code.');
      return;
    }
    setResending(true);
    setError(null);
    try {
      await api('/api/auth/resend-verification', { method: 'POST', body: { email } });
      // Like signup, this route is enumeration-resistant: it answers the
      // same whether or not the address has a pending verification. The
      // confirmation is worded so it reveals nothing either.
      setResent(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? coupleErrorMessage(err.code, err.message)
          : 'Une erreur est survenue.',
      );
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-[clamp(28px,5vw,36px)] leading-tight">
          Vérifiez votre email
        </h1>
        {/*
          No duration is quoted here on purpose. The copy said "10 minutes"
          while the server's TTL is AUTH_VERIFICATION_TTL_MIN (default 15),
          so it was simply wrong — and any number written here is a second
          copy of a server setting the client cannot read, guaranteed to
          drift again. "Renvoyer le code" is what a user with an expired
          code actually needs.
        */}
        <p className="text-sm text-cream/60">
          Nous avons envoyé un code à 8 caractères à votre boîte mail. Il expire au bout de quelques
          minutes.
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
          label="Code de vérification"
          type="text"
          required
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          // Loose on purpose. At 8 the browser truncated a paste BEFORE any
          // handler ran, so `ABCD 2345` lost its last character and no
          // retyping could recover it. The cap now lives in
          // cleanVerificationCode, which counts real characters.
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

        {error && <Alert tone="error">{error}</Alert>}

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Vérification…' : "Vérifier l'email"}
        </Button>
      </form>

      <div className="flex flex-col gap-2 text-sm text-cream/60">
        {resent ? (
          <>
            <Alert tone="success">{MESSAGE_RENVOI}</Alert>
            {/* Les trois raisons d'un silence. Aucune ne dit quoi que ce soit sur
                CETTE adresse : ce sont des regles generales, et c'est ce qui
                permet de les afficher sans annuler la resistance a
                l'enumeration que la route tient. */}
            <div className="rounded-2xl border border-cream/10 bg-plum-card/30 px-4 py-3">
              <p className="text-cream/70">Toujours rien ?</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-cream/60">
                {PISTES_SI_RIEN_NE_VIENT.map((piste) => (
                  <li key={piste}>{piste}</li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <p>
            Vous n&apos;avez pas reçu le code ?{' '}
            <button
              type="button"
              onClick={() => void resend()}
              disabled={resending}
              className="text-gold underline underline-offset-4 hover:text-cream disabled:opacity-50"
            >
              {resending ? 'Envoi…' : 'Renvoyer le code'}
            </button>
          </p>
        )}
        <p>
          <Link href="/connexion" className="text-gold hover:text-cream">
            Retour à la connexion
          </Link>
        </p>
      </div>
    </div>
  );
}
