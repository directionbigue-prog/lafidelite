'use client';

// « Choisir ce pack » — crée la commande puis part sur la page de paiement
// du prestataire (PayTech : Wave, Orange Money, Free Money, carte).
//
// Le bouton n'envoie QUE l'identifiant du pack : le prix est lu du registre
// par le serveur (lib/game/achat.ts). Une clé d'idempotence par clic évite
// qu'un double appui facture deux fois ; elle est gardée tant que l'appui
// n'a pas abouti, pour qu'un second clic rejoue la même commande.
//
// Sans session, le bouton mène à `/acheter/[pack]`, qui fait s'inscrire ou
// se connecter puis revient ouvrir le paiement — le choix ne se perd pas.
//
// `automatique` (utilisé par `/acheter/[pack]`) lance la commande dès que la
// session est là, sans second clic : le visiteur a déjà cliqué sur le pack.
// Le départ se fait alors par `location.replace`, pour que le bouton
// « retour » du navigateur, depuis PayTech, ne retombe pas sur une page qui
// relancerait aussitôt un paiement.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { coupleErrorMessage } from '@/lib/couples-error-messages';
import { cheminAchat, oublierPackChoisi } from '@/lib/game/pack-choisi';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

export function BoutonAcheterPack({
  packId,
  libelle,
  automatique = false,
}: {
  packId: string;
  libelle: string;
  automatique?: boolean;
}) {
  const { user, loading } = useAuth();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const cle = useRef<string | null>(null);
  // Le lancement automatique ne part qu'une fois — y compris sous le double
  // montage du mode strict de React en développement.
  const lance = useRef(false);

  const acheter = useCallback(
    async (remplacer: boolean) => {
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
        oublierPackChoisi();
        if (remplacer) window.location.replace(commande.paymentUrl);
        else window.location.assign(commande.paymentUrl);
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
    },
    [packId],
  );

  useEffect(() => {
    if (!automatique || loading || !user || lance.current) return;
    lance.current = true;
    void acheter(true);
  }, [automatique, loading, user, acheter]);

  if (loading) return null;
  if (!user) {
    return <ButtonLink href={cheminAchat(packId)}>{libelle}</ButtonLink>;
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => void acheter(false)} disabled={envoi}>
        {envoi ? 'Ouverture du paiement…' : libelle}
      </Button>
      {erreur && <Alert tone="error">{erreur}</Alert>}
    </div>
  );
}
