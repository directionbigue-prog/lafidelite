'use client';

// /paiement/[id] — le retour depuis la page de paiement Bictorys.
//
// Les décisions vivent dans lib/game/retour-paiement.ts : l'écran relit la
// commande toutes les 3 secondes tant qu'elle est en attente, et n'annonce
// un pack ouvert que lorsque le serveur l'a effectivement ouvert.
import { use, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { AppShell } from '@/components/app/AppShell';
import { Alert } from '@/components/ui/Alert';
import { ButtonLink } from '@/components/ui/Button';
import { packParId } from '@/lib/game/packs';
import {
  etatDuRetour,
  doitRelire,
  type CommandeLue,
  type EtatRetour,
} from '@/lib/game/retour-paiement';

export default function RetourPaiementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [etat, setEtat] = useState<EtatRetour>({ kind: 'attente' });
  const [introuvable, setIntrouvable] = useState(false);

  useEffect(() => {
    let vivant = true;
    let tentatives = 0;
    let minuteur: ReturnType<typeof setTimeout> | undefined;

    async function lire() {
      try {
        const commande = await api<CommandeLue>(`/api/orders/${encodeURIComponent(id)}`);
        if (!vivant) return;
        const suivant = etatDuRetour(commande, tentatives);
        setEtat(suivant);
        tentatives += 1;
        if (doitRelire(suivant)) minuteur = setTimeout(() => void lire(), 3000);
      } catch (err) {
        if (!vivant) return;
        if (err instanceof ApiError && err.status === 404) {
          setIntrouvable(true);
          return;
        }
        tentatives += 1;
        minuteur = setTimeout(() => void lire(), 3000);
      }
    }
    void lire();
    return () => {
      vivant = false;
      if (minuteur) clearTimeout(minuteur);
    };
  }, [id]);

  return (
    <AppShell active="accueil">
      <div className="flex max-w-xl flex-col gap-6">
        <header>
          <p className="text-[11px] uppercase tracking-[0.16em] text-cream/50">Paiement</p>
          <h1 className="mt-2 font-serif text-[clamp(30px,4.5vw,44px)] leading-[1.05]">
            {titre(etat, introuvable)}
          </h1>
        </header>
        {corps(etat, introuvable)}
      </div>
    </AppShell>
  );
}

function titre(etat: EtatRetour, introuvable: boolean): string {
  if (introuvable) return 'Commande introuvable';
  switch (etat.kind) {
    case 'ouvert':
      return 'Votre pack est ouvert';
    case 'paye-sans-droit':
      return 'Paiement reçu';
    case 'attente':
      return 'Confirmation du paiement…';
    case 'trop-long':
      return 'La confirmation tarde';
    case 'echec':
      return 'Le paiement n’a pas abouti';
  }
}

function corps(etat: EtatRetour, introuvable: boolean) {
  if (introuvable) {
    return (
      <>
        <p className="text-cream/70">Cette commande n’existe pas sur ce compte.</p>
        <ButtonLink href="/tarifs">Voir les packs</ButtonLink>
      </>
    );
  }
  switch (etat.kind) {
    case 'ouvert': {
      const pack = packParId(etat.packId);
      const fin = new Date(etat.expiresAt).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      return (
        <>
          <p className="text-[15px] leading-relaxed text-cream/70">
            {pack?.nom ?? 'Le pack'} est actif pour vous deux jusqu’au {fin}. Tous les thèmes et le
            Salon sont ouverts.
          </p>
          <ButtonLink href="/jeu/nouvelle">Lancer une partie</ButtonLink>
        </>
      );
    }
    case 'paye-sans-droit':
      return (
        <>
          <Alert tone="info">
            Le paiement est confirmé, mais le pack n’a pas pu être ouvert automatiquement.
            Contactez-nous en indiquant cette page : nous l’ouvrons à la main.
          </Alert>
          <ButtonLink href="/jeu">Retour à l’accueil</ButtonLink>
        </>
      );
    case 'attente':
      return (
        <p className="text-[15px] leading-relaxed text-cream/70">
          Nous attendons la confirmation de votre opérateur. Cela prend en général quelques secondes
          — gardez cette page ouverte.
        </p>
      );
    case 'trop-long':
      return (
        <>
          <p className="text-[15px] leading-relaxed text-cream/70">
            Votre opérateur n’a pas encore confirmé. Si vous avez validé le paiement, le pack
            s’ouvrira dès que la confirmation arrivera : rechargez cette page dans quelques minutes.
          </p>
          <ButtonLink href="/jeu" variant="ghost">
            Retour à l’accueil
          </ButtonLink>
        </>
      );
    case 'echec':
      return (
        <>
          <p className="text-[15px] leading-relaxed text-cream/70">
            Aucun montant n’a été prélevé pour cette commande. Vous pouvez réessayer.
          </p>
          <ButtonLink href="/tarifs">Choisir un pack</ButtonLink>
        </>
      );
  }
}
