'use client';

// Le lecteur de la bande-annonce de la landing (42 s, 1080×1920 en vertical,
// sans son, 5,5 Mo). Elle a remplacé le 17/10/2026 le film publicitaire de
// 20 s en 16:9 ; la page la présente dans un cadre de téléphone, d'où le
// format et les coins arrondis du conteneur.
//
// Toute décision — jouer, se taire — vient de `doitJouer` dans
// `lib/landing/film.ts`, qui est testé. Ce composant ne fait que lire l'état
// de l'appareil, regarder si le lecteur est à l'écran, et appliquer.
//
// Quatre détails qui ne se voient pas :
//   · l'affiche est l'image de la marque, à 3 s, extraite du MP4 (8 Ko) :
//     sans elle, la première image est le fond nu, et Safari iOS — qui ignore
//     `preload` — afficherait un cadre vide jusqu'au premier appui ;
//   · `muted` est indispensable même si le fichier n'a aucune piste audio :
//     Chrome n'accorde la lecture automatique qu'à un média muet, et il ne
//     sait pas qu'il n'y a pas de son avant d'avoir chargé le fichier.
//   · `preload="metadata"` ne charge que l'en-tête (le `moov` du MP4 est
//     placé avant les données, 15 Ko) : les 5,5 Mo ne partent que si la
//     bande-annonce joue. Un nouvel export doit garder le `moov` en tête
//     (« fast start »), sinon le navigateur télécharge tout pour démarrer.
//   · Avant le montage, on suppose le pire (mouvement réduit, économie de
//     données) : le rendu serveur ne connaît pas l'appareil, et un film qui
//     démarre puis s'arrête serait pire qu'un film qui démarre un instant
//     plus tard.
//
// Ce module ne doit jamais importer le `design-data` de la landing : il
// partirait dans le bundle client avec la banque de questions (voir
// `categories.test.ts`, qui cherche ce chemin jusque dans les commentaires).

import { useEffect, useRef, useState } from 'react';
import { doitJouer, type ChoixVisiteur, type ConditionsAppareil } from '@/lib/landing/film';

const SOURCE = '/videos/coeur-fidele-bande-annonce.mp4';
const AFFICHE = '/videos/coeur-fidele-bande-annonce-affiche.webp';

// La bande-annonce n'a pas de son : tout ce qu'elle dit est écrit à l'écran.
// Un lecteur d'écran n'en saurait rien sans cette transcription. Si la vidéo
// change, elle change avec elle.
//
// Elle suit la version CORRIGÉE attendue du propriétaire du produit, pas le
// premier export du 17/10/2026, qui affichait encore des promesses retirées
// de la page : « questions écrites à la main », « +25 » par accord (le moteur
// en compte 20), un total « 297 » sous « Score du couple », « des milliers de
// kilomètres », un écran qui suit la partie « en direct », et des moyens de
// paiement sans la carte bancaire. Les textes de remplacement sont ceux-ci.
const TRANSCRIPTION =
  'Cœur Fidèle, le jeu des couples. Mardi, 0 h 04. Un numéro inconnu écrit : « Tu dors ? ». ' +
  'Un message de ton ex à minuit. Tu fais quoi ? Je réponds, sans en parler ; ' +
  'je montre le message ; je laisse sans répondre ; je bloque le numéro. ' +
  'Parlez de fidélité avant d’avoir à en parler. ' +
  'Le jeu : trois manches, un score commun. Un, Miroir : devinez ce que l’autre pense. ' +
  'Deux, Scénario : une situation imaginaire. Trois, Face-à-Face : les réponses côte à côte. ' +
  'Aïssatou et Malick répondent la même chose : une preuve de confiance. ' +
  'Même réponse, un accord de plus pour votre couple. ' +
  'Côte à côte ou à distance : chacun sur son téléphone, même loin l’un de l’autre. ' +
  'Pendant qu’Aïssatou répond, l’écran de Malick suit la partie. ' +
  'Ensemble à la maison ? Un seul téléphone suffit, l’écran se masque à chaque tour. ' +
  'Fin de partie : Aïssatou et Malick, plus 80, votre accord ce soir, niveau Complices. ' +
  'Vous étiez d’accord 4 fois sur 5. On rit, on se découvre, on finit du même côté. ' +
  '267 questions dans le jeu ; 8 thèmes, du léger au sérieux ; 12 minutes, le temps ' +
  'd’un café ; zéro perdant, jamais. Première partie gratuite. Créez votre Espace ' +
  'Couple, envoyez le lien WhatsApp, jouez ce soir : coeurfidele.net. Wave, Orange ' +
  'Money, Free Money ou carte bancaire. Réservé aux 18 ans et plus.';

type Connexion = { saveData?: boolean; effectiveType?: string };

function lireConditions(): ConditionsAppareil {
  const connexion = (navigator as Navigator & { connection?: Connexion }).connection;
  return {
    mouvementReduit: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    economieDonnees: connexion?.saveData === true,
    reseau: connexion?.effectiveType,
  };
}

export function FilmPub() {
  const video = useRef<HTMLVideoElement>(null);
  const [conditions, setConditions] = useState<ConditionsAppareil>({
    mouvementReduit: true,
    economieDonnees: true,
    reseau: undefined,
  });
  const [visible, setVisible] = useState(false);
  const [choix, setChoix] = useState<ChoixVisiteur>('aucun');
  const [enLecture, setEnLecture] = useState(false);

  useEffect(() => {
    const requete = window.matchMedia('(prefers-reduced-motion: reduce)');
    const relire = () => setConditions(lireConditions());
    relire();
    requete.addEventListener('change', relire);
    return () => requete.removeEventListener('change', relire);
  }, []);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const observateur = new IntersectionObserver(
      ([entree]) => setVisible(entree?.isIntersecting === true),
      { threshold: 0.4 },
    );
    observateur.observe(el);
    return () => observateur.disconnect();
  }, []);

  const jouer = doitJouer({ ...conditions, visible, choix });

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (jouer) {
      // Un navigateur peut encore refuser (politique d'autoplay, batterie
      // faible) : le bouton reste alors sur « Lire », ce qui est la vérité.
      el.play().catch(() => setEnLecture(false));
    } else {
      el.pause();
    }
  }, [jouer]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '9/16',
        // L'écran du téléphone qui l'encadre sur la page (`.cf-tel-film`).
        borderRadius: '34px',
        overflow: 'hidden',
        background: '#1A0C19',
      }}
    >
      <video
        ref={video}
        src={SOURCE}
        poster={AFFICHE}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Bande-annonce de Cœur Fidèle, 42 secondes, sans son"
        aria-describedby="film-transcription"
        onPlay={() => setEnLecture(true)}
        onPause={() => setEnLecture(false)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      <p id="film-transcription" className="sr-only">
        {TRANSCRIPTION}
      </p>
      <button
        type="button"
        className="cf-film-bouton"
        onClick={() => setChoix(enLecture ? 'pause' : 'lecture')}
        aria-label={enLecture ? 'Mettre le film en pause' : 'Lire le film'}
        style={{
          position: 'absolute',
          right: '16px',
          bottom: '16px',
          width: '48px',
          height: '48px',
          display: 'grid',
          placeItems: 'center',
          borderRadius: '50%',
          background: 'rgba(23,13,27,.72)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(246,238,230,.24)',
          color: '#F6EEE6',
          cursor: 'pointer',
        }}
      >
        {enLecture ? (
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M4 2.2v11.6a.8.8 0 0 0 1.2.7l9.3-5.8a.8.8 0 0 0 0-1.4L5.2 1.5A.8.8 0 0 0 4 2.2Z"
              fill="currentColor"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
