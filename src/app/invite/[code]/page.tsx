'use client';

// /invite/[code] — the screen a partner lands on from a shared link.
//
// Two audiences, one URL. Someone already signed in can join in a click;
// someone new is sent to signup carrying the code, so the pairing happens
// during signup rather than as a step they have to remember afterwards.
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { coupleErrorMessage } from '@/lib/couples-error-messages';
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout';
import { OnboardingAside } from '@/components/auth/OnboardingAside';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';

interface InviteInfo {
  valid: boolean;
  creatorName?: string;
  expired?: boolean;
}

export default function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<InviteInfo>(`/api/invites/${encodeURIComponent(code)}`)
      .then(setInvite)
      .catch(() => setInvite({ valid: false, expired: false }));
  }, [code]);

  async function onJoin() {
    setJoining(true);
    setError(null);
    try {
      await api('/api/couples/join', { method: 'POST', body: { code } });
      router.push('/couple/apparies');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? coupleErrorMessage(err.code, err.message)
          : 'Une erreur est survenue.',
      );
      setJoining(false);
    }
  }

  if (!invite || authLoading) return null;

  const creator = invite.creatorName ?? 'Votre partenaire';

  return (
    <AuthSplitLayout
      aside={
        <OnboardingAside
          current="pair"
          title={invite.valid ? 'Une invitation vous attend.' : 'Cette invitation a expiré.'}
          intro={
            invite.valid
              ? 'Rejoignez l’Espace Couple : vos deux comptes seront reliés, et la partie pourra commencer.'
              : 'Un lien d’invitation ne vit que quelques jours. Votre partenaire peut vous en renvoyer un en une seconde.'
          }
        />
      }
    >
      {invite.valid ? (
        <div className="flex flex-col gap-6">
          <h1 className="font-serif text-[clamp(28px,5vw,36px)] leading-tight">
            <em className="not-italic text-gold">{creator}</em> vous invite à rejoindre Cœur Fidèle.
          </h1>

          {error && <Alert tone="error">{error}</Alert>}

          {user ? (
            <Button onClick={() => void onJoin()} disabled={joining}>
              {joining ? 'Appairage…' : `Rejoindre ${creator}`}
            </Button>
          ) : (
            // Carries the code into signup so the couple is formed during
            // registration — see SignupForm's `inviteCode` handling.
            <ButtonLink href={`/inscription?invite=${encodeURIComponent(code)}`}>
              Créer mon compte et rejoindre
            </ButtonLink>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <h1 className="font-serif text-[clamp(28px,5vw,36px)] leading-tight">
            {invite.expired ? 'Ce lien a expiré' : "Ce lien n'est plus valide"}
          </h1>
          <p className="text-cream/70">
            Demandez à votre partenaire de vous envoyer une nouvelle invitation.
          </p>
          {/*
            This branch used to end here, with no link anywhere on the page:
            a visitor arriving on a stale invite — the likeliest way anyone
            reaches this screen — was stranded with nothing to click.
          */}
          <div className="flex flex-col gap-3">
            <ButtonLink href="/inscription">Créer mon compte</ButtonLink>
            <ButtonLink href="/" variant="ghost">
              Retour à l’accueil
            </ButtonLink>
          </div>
        </div>
      )}
    </AuthSplitLayout>
  );
}
