'use client';

// /couple/attente — the invite is out, waiting on the partner.
//
// Polls `/api/couples/me` every 3s and redirects the moment the couple
// turns ACTIVE. No WebSocket for this lot (design spec, "hors périmètre");
// a poll on a screen someone stares at for a minute is the right trade.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout';
import { OnboardingAside } from '@/components/auth/OnboardingAside';
import { Button, buttonClass } from '@/components/ui/Button';

interface CoupleStatus {
  couple:
    | null
    | { status: 'PENDING'; code: string; inviteUrl: string; expiresAt: string }
    | { status: 'ACTIVE' };
}

const POLL_MS = 3000;

export default function AttenteCouplePage() {
  const user = useUser('/connexion');
  const router = useRouter();
  const [invite, setInvite] = useState<{ code: string; inviteUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await api<CoupleStatus>('/api/couples/me');
        if (cancelled) return;
        if (!res.couple) {
          router.replace('/couple/creer');
          return;
        }
        if (res.couple.status === 'ACTIVE') {
          router.replace('/couple/apparies');
          return;
        }
        setInvite({ code: res.couple.code, inviteUrl: res.couple.inviteUrl });
      } catch {
        // Network hiccup — silently retry on the next tick (design spec:
        // no intrusive error UI while polling).
      }
    }

    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user, router]);

  // `navigator.clipboard` exists ONLY in a secure context. Testing the
  // pairing flow the way it is meant to be used — two phones on the LAN,
  // hitting http://192.168.x.x:3000 — is not one, so the whole API is
  // `undefined` there and this handler threw a TypeError into an unhandled
  // rejection: the button appeared to do nothing at all, on the primary
  // action of the primary sharing screen. A permission denial rejects the
  // same way. Both now fall back to showing the link for manual copying.
  async function copyLink() {
    if (!invite) return;
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(invite.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowLink(true);
    }
  }

  if (!user) return null;

  const aside = (
    <OnboardingAside
      current="pair"
      title="Envoyez l’invitation."
      intro="Dès que votre partenaire l’ouvre, cet écran passe tout seul à la suite. Vous pouvez laisser la page ouverte."
    />
  );

  // Distinct from `!user`: the first poll is still in flight, or it failed
  // and the 3s interval will retry. Rendering null here left a blank black
  // screen with no indication anything was happening.
  if (!invite) {
    return (
      <AuthSplitLayout aside={aside}>
        <p role="status" className="text-sm text-cream/60">
          Chargement de votre invitation…
        </p>
      </AuthSplitLayout>
    );
  }

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(
    `Rejoins-moi sur Cœur Fidèle : ${invite.inviteUrl}`,
  )}`;

  return (
    <AuthSplitLayout aside={aside}>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-serif text-[clamp(28px,5vw,36px)] leading-tight">
            En attente de votre partenaire
          </h1>
          <p className="text-sm text-cream/60">
            Partagez ce lien ou ce code pour qu&rsquo;il/elle vous rejoigne.
          </p>
        </header>

        <div className="rounded-2xl border border-cream/16 bg-plum-card p-6 text-center">
          <p className="text-[10px] uppercase tracking-[0.14em] text-cream/50">Code</p>
          <p className="mt-2 font-serif text-4xl tracking-[0.2em] text-gold">{invite.code}</p>
        </div>

        <div className="flex flex-col gap-3">
          <Button variant="secondary" fullWidth onClick={() => void copyLink()}>
            {copied ? 'Lien copié !' : 'Copier le lien'}
          </Button>

          {/* An external link, so a plain anchor with the button's shape
              rather than `ButtonLink`, which routes internally. */}
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            className={buttonClass('primary', true)}
          >
            Relancer sur WhatsApp
          </a>
        </div>

        {showLink && (
          <div className="rounded-2xl border border-cream/16 bg-plum-card p-4">
            <p className="mb-2 text-xs text-cream/60">
              La copie automatique n&rsquo;est pas disponible ici. Sélectionnez le lien :
            </p>
            <p className="select-all break-all font-mono text-xs text-gold">{invite.inviteUrl}</p>
          </div>
        )}
      </div>
    </AuthSplitLayout>
  );
}
