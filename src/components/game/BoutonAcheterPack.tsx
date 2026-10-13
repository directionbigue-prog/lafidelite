'use client';

// « Choisir ce pack » — crée la commande puis part sur la page de paiement
// Bictorys (Wave, Orange Money, carte…).
//
// Le bouton n'envoie QUE l'identifiant du pack : le prix est lu du registre
// par le serveur (lib/game/achat.ts). Une clé d'idempotence par clic évite
// qu'un double appui facture deux fois ; elle est gardée tant que l'appui
// n'a pas abouti, pour qu'un second clic rejoue la même commande.
import { useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { coupleErrorMessage } from '@/lib/couples-error-messages';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

export function BoutonAcheterPack({ packId, libelle }: { packId: string; libelle: string }) {
  const { user, loading } = useAuth();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const cle = useRef<string | null>(null);

  if (loading) return null;
  if (!user) {
    return <ButtonLink href="/inscription">Créer un compte pour choisir ce pack</ButtonLink>;
  }

  async function acheter() {
    setEnvoi(true);
    setErreur(null);
    cle.current ??= globalThis.crypto.randomUUID();
    try {
      const commande = await api<{ paymentUrl: string | null }>('/api/orders', {
        method: 'POST',
        body: { packId },
        headers: { 'Idempotency-Key': cle.current },
      });
      if (!commande.paymentUrl) throw new Error('no payment url');
      window.location.assign(commande.paymentUrl);
    } catch (err) {
      // Une commande refusée pour de bon (pack retiré, prestataire absent)
      // se relance avec une clé neuve ; sinon le serveur rejouerait l'échec.
      cle.current = null;
      setErreur(
        err instanceof ApiError
          ? coupleErrorMessage(err.code, err.message)
          : 'Le paiement n’a pas pu être lancé. Réessayez dans un instant.',
      );
      setEnvoi(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => void acheter()} disabled={envoi}>
        {envoi ? 'Ouverture du paiement…' : libelle}
      </Button>
      {erreur && <Alert tone="error">{erreur}</Alert>}
    </div>
  );
}
