// /settings — account-level controls.
//
// Two flows live here today:
//   1. Set / change password
//      - If the account was created via OAuth (hasPassword=false), the
//        "Set password" form calls POST /api/auth/set-password — no current
//        password required, because there isn't one.
//      - Otherwise the "Change password" form calls PUT /api/auth/change-password
//        with currentPassword + newPassword.
//   2. Link a provider (Google)
//      - When Google is not already linked, the button kicks the user to
//        GET /api/auth/oauth/google/start?next=/settings, which goes through
//        the normal OAuth dance and lands back on /settings linked.
//      - When already linked, we just show a "linked" pill — no unlink action
//        yet (would need a /api/auth/oauth/google/unlink endpoint with a
//        guard refusing to leave the user without any sign-in method).
//
// Copy note: this page used to address the user as "tu" while every other
// screen says "vous". Two registers inside one product reads as two
// products; it now matches the rest.
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { rappelsActifs } from '@/lib/rituel/ecran';
import { TYPE_RAPPEL } from '@/lib/rituel/rappel';
import { api, ApiError } from '@/lib/api';
import { useAuth, useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { coupleErrorMessage } from '@/lib/couples-error-messages';
import { Field } from '@/components/ui/Field';
import { PasswordField } from '@/components/ui/PasswordField';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FocusLayout } from '@/components/ui/FocusLayout';
import { AppShell } from '@/components/app/AppShell';

/**
 * Codes whose wording depends on being HERE rather than on a sign-in
 * screen: `INVALID_CREDENTIALS` means "the current password you typed is
 * wrong", not "email or password incorrect". Everything else defers to the
 * shared French table so the same code never gets two translations.
 */
const SETTINGS_ERROR_OVERRIDES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Mot de passe actuel incorrect.',
  PASSWORD_ALREADY_SET: 'Un mot de passe est déjà défini. Utilisez « changer le mot de passe ».',
};

/**
 * Les rappels du soir (cron `rappels-couple`). Activés par défaut, comme
 * toute préférence de ce dépôt ; ce réglage est la promesse que le mail
 * lui-même fait (« Vous pouvez couper ces rappels dans vos Réglages »).
 */
function RappelsSection() {
  const { toast } = useToast();
  const [actifs, setActifs] = useState<boolean | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let annule = false;
    api<{ prefs: unknown }>('/api/notifications/prefs')
      .then((res) => !annule && setActifs(rappelsActifs(res.prefs, TYPE_RAPPEL)))
      // Sans lecture, on n'affiche pas d'interrupteur plutôt qu'un faux état.
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, []);

  if (actifs === null) return null;

  async function basculer() {
    const voulu = !actifs;
    setEnvoi(true);
    try {
      await api('/api/notifications/prefs', {
        method: 'PATCH',
        body: { prefs: { [TYPE_RAPPEL]: { email: voulu } } },
      });
      setActifs(voulu);
      toast(voulu ? 'Rappels activés.' : 'Rappels désactivés.', 'success');
    } catch {
      toast('Le réglage n’a pas pu être enregistré. Réessayez.', 'error');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-cream/16 bg-plum-card p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <h2 className="font-serif text-xl">Rappels par email</h2>
          <span className="mt-1 text-xs leading-relaxed text-cream/50">
            Un petit mot le soir si vous n’êtes pas venus depuis deux jours. Jamais plus d’un par
            absence.
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={actifs}
          aria-label="Rappels par email"
          disabled={envoi}
          onClick={() => void basculer()}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            actifs ? 'bg-gold' : 'bg-cream/20'
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-1 h-5 w-5 rounded-full bg-ink transition-[left] ${
              actifs ? 'left-6' : 'left-1'
            }`}
          />
        </button>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const user = useUser();
  const { refresh } = useAuth();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <FocusLayout centerText>
        <p role="status" className="text-sm text-cream/60">
          Chargement…
        </p>
      </FocusLayout>
    );
  }

  const hasPassword = user.hasPassword;
  const googleLinked = user.linkedProviders.includes('google');

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length === 0) {
      setError('Saisissez un nouveau mot de passe.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }

    setSubmitting(true);
    try {
      if (hasPassword) {
        await api('/api/auth/change-password', {
          method: 'PUT',
          body: { currentPassword, newPassword },
        });
        toast('Mot de passe mis à jour.', 'success');
      } else {
        await api('/api/auth/set-password', {
          method: 'POST',
          body: { newPassword },
        });
        toast('Mot de passe défini. Vous pouvez maintenant vous connecter par email.', 'success');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(SETTINGS_ERROR_OVERRIDES[err.code] ?? coupleErrorMessage(err.code, err.message));
      } else {
        setError('Erreur réseau. Réessayez.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell active="reglages">
      {/*
        The shell's main area does not impose a rhythm on the page — each
        page owns its own — so the column and its gap live here. Previously
        `FocusLayout` supplied them.
      */}
      {/*
        Capped narrower than the shell allows: these are forms, and a text
        input stretched to 900px is harder to use, not easier. The dashboard
        wants the full width; this page does not.
      */}
      <div className="flex max-w-xl flex-col gap-8">
        {/* The brand lockup lives in the shell's sidebar now, not here. */}
        <header>
          <h1 className="font-serif text-[clamp(28px,4.5vw,40px)] leading-tight">Réglages</h1>
          <p className="mt-1 text-sm text-cream/60">Connecté en tant que {user.email}</p>
        </header>

        {/* ── Password section ─────────────────────────────────────────── */}
        <section className="flex flex-col gap-4 rounded-2xl border border-cream/16 bg-plum-card p-6">
          <div>
            <h2 className="font-serif text-xl">
              {hasPassword ? 'Changer le mot de passe' : 'Définir un mot de passe'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-cream/60">
              {hasPassword
                ? 'Vos autres sessions seront déconnectées.'
                : 'Vous vous êtes connecté via Google. Définissez un mot de passe pour pouvoir aussi vous connecter par email.'}
            </p>
          </div>

          <form onSubmit={onSubmitPassword} className="flex flex-col gap-5">
            {hasPassword && (
              <Field
                label="Mot de passe actuel"
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            )}
            {/* The strength meter belongs here: the user is CHOOSING a new
              password, which is exactly when the hint helps — unlike on
              sign-in, where scoring an existing password is noise. */}
            <PasswordField
              label="Nouveau mot de passe"
              value={newPassword}
              onChange={setNewPassword}
            />
            <Field
              label="Confirmer le nouveau mot de passe"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            {error && <Alert tone="error">{error}</Alert>}

            <Button type="submit" disabled={submitting} fullWidth>
              {submitting
                ? 'Enregistrement…'
                : hasPassword
                  ? 'Changer le mot de passe'
                  : 'Définir le mot de passe'}
            </Button>
          </form>
        </section>

        {/* ── Linked providers section ────────────────────────────────── */}
        <section className="flex flex-col gap-4 rounded-2xl border border-cream/16 bg-plum-card p-6">
          <h2 className="font-serif text-xl">Comptes liés</h2>
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Google</span>
              <span className="mt-0.5 text-xs leading-relaxed text-cream/50">
                {googleLinked
                  ? 'Vous pouvez vous connecter via Google.'
                  : 'Liez votre compte Google pour vous connecter en un clic.'}
              </span>
            </div>
            {googleLinked ? (
              <span className="shrink-0 rounded-full border border-gold/40 bg-plum-card2 px-3 py-1 text-xs font-semibold text-gold">
                Lié
              </span>
            ) : (
              // A top-level navigation, not a fetch: the OAuth start route
              // 302s to Google and the browser must follow it so the state
              // and PKCE cookies it sets are stored.
              <a
                href="/api/auth/oauth/google/start?next=/settings"
                className="shrink-0 rounded-full border border-cream/26 px-4 py-2 text-sm font-semibold text-cream transition-colors hover:border-gold"
              >
                Lier Google
              </a>
            )}
          </div>
        </section>

        <RappelsSection />

        {/*
          No "Retour au jeu" link any more: the sidebar carries Accueil on
          every screen, so a second way back would be one affordance too
          many — and the kind of duplicate that drifts.
        */}
      </div>
    </AppShell>
  );
}
