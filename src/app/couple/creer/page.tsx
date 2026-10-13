'use client';

// /couple/creer — step 2 of onboarding: open an Espace Couple.
//
// Redirects on arrival when the user already has one: PENDING means the
// invite is out and we are waiting, ACTIVE means the pairing is done. So
// this screen only ever renders for someone with no couple at all.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { coupleErrorMessage } from '@/lib/couples-error-messages';
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout';
import { OnboardingAside } from '@/components/auth/OnboardingAside';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';

interface CoupleStatus {
  couple: null | { status: 'PENDING' } | { status: 'ACTIVE' };
}

export default function CreerCouplePage() {
  const user = useUser('/connexion');
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api<CoupleStatus>('/api/couples/me')
      .then((res) => {
        if (res.couple?.status === 'PENDING') {
          router.replace('/couple/attente');
        } else if (res.couple?.status === 'ACTIVE') {
          router.replace('/couple/apparies');
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [user, router]);

  async function onCreate() {
    setCreating(true);
    setError(null);
    try {
      await api('/api/couples', { method: 'POST' });
      router.push('/couple/attente');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? coupleErrorMessage(err.code, err.message)
          : 'Une erreur est survenue.',
      );
      setCreating(false);
    }
  }

  if (!user || checking) return null;

  return (
    <AuthSplitLayout
      aside={
        <OnboardingAside
          current="pair"
          title="Reliez vos deux comptes."
          intro="Vous créez l’Espace Couple, votre partenaire le rejoint avec le lien ou le code. Une seule fois."
        />
      }
    >
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-serif text-[clamp(28px,5vw,36px)] leading-tight">
            Bienvenue, <em className="not-italic text-gold">{user.name ?? user.email}</em>
          </h1>
          <p className="text-sm text-cream/60">
            Créez votre Espace Couple, puis invitez votre partenaire à vous rejoindre.
          </p>
        </header>

        {error && <Alert tone="error">{error}</Alert>}

        <Button onClick={() => void onCreate()} disabled={creating}>
          {creating ? 'Création…' : 'Créer notre Espace Couple'}
        </Button>

        {/* Le Salon n'exige pas de partenaire (depuis le 13/10/2026) : on y
            joue à deux sur cet appareil. Cet écran n'a pas la barre de
            navigation de l'app, d'où ce lien. */}
        <ButtonLink href="/salon" variant="ghost">
          Jouer au Salon sans partenaire
        </ButtonLink>
      </div>
    </AuthSplitLayout>
  );
}
