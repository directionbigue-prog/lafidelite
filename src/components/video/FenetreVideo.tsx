'use client';

// La fenêtre vidéo flottante — le partenaire en grand, soi en vignette.
//
// Rendue une seule fois, dans le layout racine, à côté des pages : elle reste
// à l'écran pendant toute la partie. Elle se réduit en pastille pour ne
// jamais cacher une question ; réduite, le son continue.
//
// Les couleurs viennent de la charte (plum, gold, cream) — jamais d'hex.
import { useEffect, useRef, useState } from 'react';
import { useVideo } from '@/contexts/VideoContext';

function Piste({
  piste,
  muette,
  miroir,
  className,
}: {
  piste: MediaStreamTrack | null;
  muette: boolean;
  miroir?: boolean;
  className: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = piste ? new MediaStream([piste]) : null;
  }, [piste]);
  if (!piste) return null;
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muette}
      className={`${className} object-cover ${miroir ? '-scale-x-100' : ''}`}
    />
  );
}

function Son({ piste }: { piste: MediaStreamTrack | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = piste ? new MediaStream([piste]) : null;
  }, [piste]);
  return <audio ref={ref} autoPlay />;
}

const BOUTON =
  'flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';

export function FenetreVideo() {
  const v = useVideo();
  const [reduite, setReduite] = useState(false);

  if (v.statut === 'inactif') return null;

  if (v.statut === 'erreur') {
    return (
      <div
        role="alert"
        className="fixed bottom-4 right-4 z-50 flex max-w-xs flex-col gap-2 rounded-2xl border border-rose/40 bg-plum-card p-4 text-sm text-cream shadow-2xl"
      >
        <p>{v.erreur ?? 'L’appel a été interrompu.'}</p>
        <div className="flex gap-3">
          <button
            type="button"
            className="font-semibold text-gold"
            onClick={() => void v.demarrer()}
          >
            Relancer
          </button>
          <button type="button" className="text-cream/60" onClick={() => void v.quitter()}>
            Fermer
          </button>
        </div>
      </div>
    );
  }

  const { pistes } = v;
  const nom = pistes.nomPartenaire ?? 'votre partenaire';

  if (reduite) {
    return (
      <>
        <Son piste={pistes.sonAudio} />
        <button
          type="button"
          onClick={() => setReduite(false)}
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-gold/50 bg-plum-card px-4 py-2.5 text-sm font-semibold text-cream shadow-2xl"
        >
          <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-gold" />
          En appel avec {nom}
        </button>
      </>
    );
  }

  return (
    <section
      aria-label={`Appel vidéo avec ${nom}`}
      className="fixed bottom-4 right-4 z-50 w-[min(15rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-cream/16 bg-plum-deep shadow-2xl sm:w-72"
    >
      <Son piste={pistes.sonAudio} />
      <div className="relative aspect-[3/4] w-full bg-ink">
        {pistes.saVideo ? (
          <Piste piste={pistes.saVideo} muette className="h-full w-full" />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-cream/60">
            {v.statut === 'connexion'
              ? 'Connexion…'
              : pistes.partenairePresent
                ? `${nom} a coupé sa caméra`
                : `En attente de ${nom}…`}
          </div>
        )}
        <div className="absolute bottom-2 right-2 h-20 w-16 overflow-hidden rounded-xl border border-cream/30 bg-plum-card">
          <Piste
            piste={v.cameraActive ? pistes.maVideo : null}
            muette
            miroir
            className="h-full w-full"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={!v.microActif}
            aria-label={v.microActif ? 'Couper le micro' : 'Rétablir le micro'}
            onClick={v.basculerMicro}
            className={`${BOUTON} ${v.microActif ? 'bg-cream/12 text-cream' : 'bg-rose text-ink'}`}
          >
            {v.microActif ? 'Mic' : 'Off'}
          </button>
          <button
            type="button"
            aria-pressed={!v.cameraActive}
            aria-label={v.cameraActive ? 'Couper la caméra' : 'Rétablir la caméra'}
            onClick={v.basculerCamera}
            className={`${BOUTON} ${v.cameraActive ? 'bg-cream/12 text-cream' : 'bg-rose text-ink'}`}
          >
            {v.cameraActive ? 'Cam' : 'Off'}
          </button>
          <button
            type="button"
            aria-label="Réduire la fenêtre vidéo"
            onClick={() => setReduite(true)}
            className={`${BOUTON} bg-cream/12 text-cream`}
          >
            –
          </button>
        </div>
        <button
          type="button"
          onClick={() => void v.quitter()}
          className="rounded-full bg-wine px-3.5 py-2 text-xs font-bold text-cream transition-colors hover:bg-wine-deep"
        >
          Raccrocher
        </button>
      </div>
    </section>
  );
}
