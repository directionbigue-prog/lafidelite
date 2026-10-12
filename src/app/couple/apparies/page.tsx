'use client';

// /couple/apparies — the pairing is done.
//
// Every route into this screen (/couple/creer's ACTIVE redirect,
// /couple/attente's, and /invite/[code] after a successful join) ends here,
// so its CTA is the ONLY bridge from the pairing flow to the game. It
// replaced this page's original closing line, which told the couple a first
// game was still to come — copy written before the game engine existed, and
// which left every freshly-paired couple at a dead end once it did.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout';
import { OnboardingAside } from '@/components/auth/OnboardingAside';
import { ButtonLink } from '@/components/ui/Button';

interface CoupleStatus {
  couple: null | { status: 'PENDING' } | { status: 'ACTIVE'; partnerName: string | null };
}

export default function AppariesCouplePage() {
  const user = useUser('/connexion');
  const router = useRouter();
  const [partnerName, setPartnerName] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    api<CoupleStatus>('/api/couples/me')
      .then((res) => {
        if (res.couple?.status === 'ACTIVE') {
          setPartnerName(res.couple.partnerName);
        } else if (res.couple?.status === 'PENDING') {
          router.replace('/couple/attente');
        } else {
          router.replace('/couple/creer');
        }
      })
      .catch(() => setPartnerName(null));
  }, [user, router]);

  if (!user || partnerName === undefined) return null;

  return (
    <AuthSplitLayout
      aside={
        <OnboardingAside
          current="ready"
          title="Vous êtes reliés."
          intro="Une seule personne se connecte pour jouer : vous vous passerez l’appareil quand l’écran le demandera."
        />
      }
    >
      <div className="flex flex-col gap-6">
        <div className="text-5xl" aria-hidden>
          💛
        </div>
        <header className="flex flex-col gap-3">
          <h1 className="font-serif text-[clamp(30px,5.4vw,40px)] leading-tight">
            Vous êtes appariés !
          </h1>
          <p className="text-[17px] leading-relaxed text-cream/80">
            <em className="not-italic text-gold">{user.name ?? 'Vous'}</em> et{' '}
            <em className="not-italic text-gold">{partnerName ?? 'votre partenaire'}</em> formez
            maintenant un Espace Couple.
          </p>
        </header>

        <ButtonLink href="/jeu">Commencer à jouer</ButtonLink>
      </div>
    </AuthSplitLayout>
  );
}
