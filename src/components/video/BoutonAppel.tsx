'use client';

// « Appel vidéo » — lance l'appel du couple.
//
// N'apparaît que si le serveur dit la vidéo disponible (`DAILY_API_KEY`
// posée) : un bouton qui mène à « non configuré » ne devrait pas exister.
// Pendant l'appel il disparaît — la fenêtre flottante porte « Raccrocher ».
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useVideo } from '@/contexts/VideoContext';
import { Button, type ButtonVariant } from '@/components/ui/Button';

// Partagé entre toutes les instances : la disponibilité ne change pas d'un
// écran à l'autre, inutile de la redemander à chaque navigation.
let disponibiliteEnCache: Promise<boolean> | null = null;

function disponibilite(): Promise<boolean> {
  disponibiliteEnCache ??= api<{ disponible: boolean }>('/api/video/jeton')
    .then((r) => r.disponible)
    .catch(() => {
      disponibiliteEnCache = null;
      return false;
    });
  return disponibiliteEnCache;
}

export function BoutonAppel({
  variant = 'secondary',
  fullWidth = false,
  libelle = 'Appel vidéo',
}: {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  libelle?: string;
}) {
  const user = useUser();
  const video = useVideo();
  const [disponible, setDisponible] = useState(false);

  useEffect(() => {
    if (!user) return;
    let annule = false;
    void disponibilite().then((d) => !annule && setDisponible(d));
    return () => {
      annule = true;
    };
  }, [user]);

  if (!disponible || video.statut === 'en-appel') return null;

  return (
    <Button
      variant={variant}
      fullWidth={fullWidth}
      disabled={video.statut === 'connexion'}
      onClick={() => void video.demarrer()}
    >
      {video.statut === 'connexion' ? 'Connexion…' : libelle}
    </Button>
  );
}
