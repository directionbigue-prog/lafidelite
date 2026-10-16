// Cœur Fidèle — page d'accueil marketing.
//
// Reproduction À L'IDENTIQUE du canevas Claude Design
// « Cœur Fidèle — le jeu de couple sur la fidélité »
// (artifact WqhHkSCUi1yHGRbycXNEAG), sur demande explicite.
//
// ── Ce que « à l'identique » veut dire ici, et ce que ça coûte ──────────
//
// Le markup, les styles inline, les ancres et TOUTE la copie viennent du
// canevas sans retouche. Les données de maquette vivent dans
// `@/lib/landing/design-data`, transcrites depuis le `DCLogic.renderVals()`
// de l'export.
//
// LES PRIX ET LES PALIERS, EUX, SONT VRAIS. Ils viennent de
// `lib/game/packs.ts` via `design-data`, et non plus du canevas — qui
// annonçait un abonnement à 25 000 F là où l'Intégral en coûte 9 900 par
// mois, et deux thèmes gratuits là où un seul l'est. Un chiffre de maquette
// qui exagère un contenu est une licence marketing ; un prix faux est une
// promesse que la caisse ne tiendra pas. Les huit cartes de thèmes portent
// donc le nom du palier qui les ouvre, exactement comme le sélecteur de
// `/jeu/nouvelle` — les deux écrans ne peuvent plus se contredire.
//
// LES COMPTEURS DE QUESTIONS aussi : le grand nombre du bandeau, le titre
// de la section des thèmes et les huit cartes comptent `QUESTIONS_SEED`. Le
// canevas affichait 440, et 60 ou 50 par carte, là où la banque en livre 267
// et 30 par thème.
//
// Conséquence assumée : le RESTE de cette page annonce des choses que le
// produit ne fait pas encore.
//   · L'INSCRIPTION n'en fait plus partie. La carte annonçait « Pas de
//     mot de passe. Vous recevez un code par SMS » et son champ réclamait
//     un numéro de téléphone, alors que rien dans le code ne sait en
//     traiter un : l'auth réelle est email + mot de passe, puis un code de
//     vérification à 8 caractères envoyé par email. La carte dit
//     désormais vrai ET fonctionne — son champ mène à `/inscription` avec
//     l'adresse en query. Voir `components/landing/SignupCard.tsx`. La
//     séquence animée et la promesse de clôture ont suivi, et les cellules
//     du code sont passées de six chiffres à huit caractères Crockford,
//     comme le vrai générateur.
//   · LE MODE « DEUX TÉLÉPHONES » a été retiré puis REMIS, et l'ordre
//     compte. La page promettait « Chacun son téléphone, en même temps »
//     quand le moteur ne savait jouer que sur un appareil : promesse retirée.
//     Le 13/10/2026 le mode à distance est livré (`lib/distance/distance.ts`)
//     : chacun joue sur son téléphone, TOUR À TOUR, et
//     l'écran de celui qui attend suit la partie. La page le dit à nouveau —
//     mais jamais « en même temps » : le moteur garde une seule
//     `activePlayerRole` à la fois. `categories.test.ts` tient les deux bouts.
//   · LE RITUEL DU JOUR (question du jour, flamme, badges, rappels) et le
//     JEU À DISTANCE ont chacun leur carte dans « L'essentiel », écrite
//     d'après ce que font `lib/rituel/` et `lib/distance/` — pas d'après une
//     maquette. L'appel vidéo, livré le même jour, a été retiré du produit le
//     soir même : la page n'en parle plus.
//   · LA PAGE COURTE (14/10/2026). Elle mesurait 11 566 px sur ordinateur et
//     18 663 sur téléphone — 21 écrans, les tarifs au seizième. Dix sections
//     du canevas sont parties (démo animée, jeu détaillé, à distance, rituel,
//     aperçu, catégories, Salon, témoignages, règles, pour qui), remplacées
//     par quatre cartes « L'essentiel » ; la FAQ garde quatre questions.
//     Reste : héros et inscription, chiffres, film, l'essentiel, tarifs, FAQ,
//     appel final. Les sections retirées sont dans l'historique git (commit
//     précédent celui qui les retire) si l'une doit revenir.
//   · LE FILM PUBLICITAIRE (section `#film`, 14/10/2026) n'existe pas dans le
//     canevas. Il vit dans `components/landing/FilmPub.tsx`, seul îlot client
//     de la page, et ne démarre que selon `lib/landing/film.ts` : 7 Mo payés
//     en données mobiles ne se dépensent pas à l'ouverture de la page.
//   · Les liens « # » de la maquette (Confidentialité, CGU, Support, English,
//     « Poser la vôtre sur WhatsApp ») ont été RETIRÉS le 16/10/2026, avec la
//     capture du canevas qui servait d'image au héros et les chiffres sans
//     source : voir `lib/landing/sans-traces.test.ts`. Un lien revient le jour
//     où sa page existe.
//
// Une version précédente de ce fichier corrigeait TOUS ces points en
// dérivant la grille du vrai contenu. Elle a été remplacée délibérément :
// la demande était la fidélité au design. Les prix en sont ressortis parce
// qu'ils ont cessé d'être de la maquette pour devenir un tarif.
// D'ici là, ne pas lire le reste de cette page comme une description de l'app.
//
// `app/page.tsx` est exempté des deux tripwires de design
// (`one-button-design.test.ts`, `one-layout-root.test.ts`) : la landing a
// droit à sa propre mise en page et à son propre traitement de CTA, ce qui
// est précisément ce qui rend cette reproduction possible.
import { Fragment } from 'react';
import './landing.css';
import { buildLandingDesignData, TOTAL_QUESTIONS } from '@/lib/landing/design-data';
import { cheminAchat } from '@/lib/game/pack-choisi';
import { MOYENS_DE_PAIEMENT } from '@/lib/game/achat';
import { SignupCard } from '@/components/landing/SignupCard';
import { FilmPub } from '@/components/landing/FilmPub';
import { Marque } from '@/components/ui/Marque';
import { donneesStructureesAccueil, scriptJsonLd } from '@/lib/seo/donnees-structurees';
import { PAGES_DE_CONTENU } from '@/lib/seo/contenus';

export const runtime = 'nodejs';

// Les seules retouches au canevas, et pourquoi.
//
// La maquette n'avait aucune destination réelle : ses dix-huit liens sont
// des ancres internes ou des « # ». Reproduite telle quelle, la page
// d'accueil ne laissait plus AUCUN moyen de s'inscrire, de se connecter ou
// d'atteindre le jeu en cliquant — /inscription n'était joignable qu'en
// tapant l'URL. C'est le défaut qu'avait déjà attrapé
// `lib/game/navigation-reachable.test.ts`, et qu'un portage fidèle
// réintroduisait mot pour mot.
//
// Trois attributs `href` pointent donc vers de vraies routes. Rien d'autre
// ne change : ni un style, ni un mot, ni un pixel.
//
// Le canevas n'offrait par ailleurs aucune entrée « se connecter » — un
// visiteur déjà inscrit n'avait nulle part où aller. Le lien ajouté dans la
// nav reprend exactement le traitement de ses voisins.
const SIGN_IN_HREF = '/connexion';
const SIGN_UP_HREF = '/inscription';
const PLAY_HREF = '/jeu';

export default function Home() {
  const { ctaLabel, faq, pricingCards, salonAcces } = buildLandingDesignData();

  // Les quatre cartes « L'essentiel ». Chaque phrase correspond à du code :
  // le jeu (`game/state-machine.ts`, format STANDARD 5/5/5), le mode à
  // distance (`lib/distance/`, tour à tour), la série du rituel qui ne compte
  // que les jours À DEUX (`lib/rituel/serie.ts`), et l'accès au Salon lu du
  // registre des packs — jamais écrit à la main.
  const essentiel = [
    {
      titre: 'Le jeu',
      accroche: 'Trois manches, un score commun',
      texte:
        'Miroir, Scénario et Face-à-Face : 15 questions, une douzaine de minutes. Vous jouez ensemble, avec un seul score pour le couple.',
    },
    {
      titre: 'À distance',
      accroche: 'Chacun sur son téléphone',
      texte:
        'Loin l’un de l’autre, chacun répond sur le sien, tour à tour ; l’écran de celui qui attend suit la partie.',
    },
    {
      titre: 'Le rituel',
      accroche: 'Une question par jour',
      texte:
        'Chaque jour, une question à laquelle vous répondez tous les deux. Votre série augmente chaque jour où vous le faites.',
    },
    {
      titre: 'Le Salon',
      accroche: 'Cinq jeux de société',
      texte: `Dames, awalé, ludo, le mot et mots croisés, sur le même téléphone. ${salonAcces}.`,
    },
  ];

  // Quatre questions sur six : celles qu'on se pose AVANT de payer (un
  // téléphone suffit-il, l'autre voit-il mes réponses, comment payer, combien
  // de temps dure un pack). Choisies par leur numéro dans `design-data`, et
  // renumérotées à l'affichage pour ne pas montrer de trou.
  const faqEssentielle = faq.filter((f) => ['01', '02', '04', '05'].includes(f.num));

  return (
    <>
      {/* Données structurées : la marque, le site, les offres du registre des
          packs et la FAQ affichée plus bas — voir lib/seo/donnees-structurees.ts. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: scriptJsonLd(donneesStructureesAccueil(faqEssentielle)),
        }}
      />
      <div
        className="cf-landing"
        style={{ background: '#170D1B', minHeight: '100vh', position: 'relative' }}
      >
        {' '}
        <header
          style={{
            position: 'relative',
            zIndex: '5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '24px',
            padding: '26px clamp(20px,5vw,72px)',
            maxWidth: '1440px',
            margin: '0 auto',
          }}
        >
          {' '}
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
            {' '}
            {/* La pastille dorée du canevas tenait lieu de marque faute d'en
                avoir une. Depuis le 03/10 le produit a son signe, et c'est le
                même composant que porte l'en-tête de tous les autres écrans. */}
            <Marque taille={26} />
            <span
              style={{
                fontFamily: "'Instrument Serif',serif",
                fontSize: '25px',
                letterSpacing: '.01em',
              }}
            >
              Cœur Fidèle
            </span>
          </div>
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'clamp(14px,2.4vw,34px)',
              fontSize: '15px',
              color: 'rgba(246,238,230,.66)',
            }}
          >
            {' '}
            <a href="#film" style={{ color: 'inherit' }}>
              Le film
            </a>
            <a href="#essentiel" style={{ color: 'inherit' }}>
              L'essentiel
            </a>
            <a href="#prix" style={{ color: 'inherit' }}>
              Tarifs
            </a>
            <a href="#faq" style={{ color: 'inherit' }}>
              FAQ
            </a>
            <a href={SIGN_IN_HREF} style={{ color: 'inherit' }}>
              Se connecter
            </a>
          </nav>
          <a
            href={SIGN_UP_HREF}
            style={{
              padding: '11px 22px',
              borderRadius: '4px',
              background: '#F6EEE6',
              color: '#170D1B',
              fontWeight: '600',
              fontSize: '15px',
              whiteSpace: 'nowrap',
            }}
            className="cf-h1"
          >
            S'inscrire
          </a>
        </header>
        <section
          style={{
            position: 'relative',
            zIndex: '4',
            maxWidth: '1440px',
            margin: '0 auto',
            padding: 'clamp(28px,5vw,64px) clamp(20px,5vw,72px) clamp(60px,7vw,110px)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(340px, 100%),1fr))',
            gap: 'clamp(32px,3.4vw,48px)',
            alignItems: 'center',
          }}
        >
          {' '}
          <div style={{ animation: 'riseIn .8s cubic-bezier(.2,.7,.3,1) both' }}>
            {' '}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '7px 15px',
                border: '1px solid rgba(232,184,96,.34)',
                borderRadius: '4px',
                fontSize: '13px',
                letterSpacing: '.09em',
                textTransform: 'uppercase',
                color: '#E8B860',
                marginBottom: '26px',
              }}
            >
              {' '}
              <span
                style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#E8B860' }}
              ></span>
              Côte à côte ou à distance · 12 minutes
            </div>
            <h1
              style={{
                fontFamily: "'Instrument Serif',serif",
                fontWeight: '400',
                fontSize: 'clamp(48px,6.4vw,90px)',
                lineHeight: '.98',
                letterSpacing: '-.02em',
                margin: '0 0 24px',
                textWrap: 'balance',
              }}
            >
              Le jeu de couple
              <br />
              qui fait parler
              <br />
              <em style={{ color: '#E8B860' }}>de fidélité.</em>
            </h1>
            <p
              style={{
                fontSize: 'clamp(17px,1.5vw,20px)',
                lineHeight: '1.55',
                color: 'rgba(246,238,230,.7)',
                maxWidth: '30em',
                margin: '0 0 34px',
                textWrap: 'pretty',
              }}
            >
              Cœur Fidèle est un jeu de couple en 15 questions, réparties en trois manches, avec un
              score commun. Vous jouez sur un téléphone que vous vous passez, ou chacun sur le sien
              si vous êtes loin l’un de l’autre.
            </p>
            <SignupCard ctaLabel={ctaLabel} />
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '22px',
                fontSize: '14px',
                color: 'rgba(246,238,230,.7)',
                marginBottom: '26px',
              }}
            >
              {' '}
              <span>Première partie gratuite</span>
              <span>Paiement Mobile Money</span>
              <span>Sans carte bancaire</span>
            </div>
          </div>
          <div
            style={{
              position: 'relative',
              animation: 'riseIn 1s .12s cubic-bezier(.2,.7,.3,1) both',
            }}
          >
            {' '}
            <div
              style={{
                position: 'absolute',
                inset: '-10px',
                borderRadius: '48px',
                backgroundImage:
                  'radial-gradient(circle,rgba(232,184,96,.1) 0 1.5px,transparent 1.5px),radial-gradient(circle,transparent 0 13px,rgba(232,184,96,.06) 13px 14px,transparent 14px)',
                backgroundSize: '34px 34px,68px 68px',
                backgroundPosition: '0 0,17px 17px',
                pointerEvents: 'none',
              }}
            ></div>
            <div
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '325/361',
                borderRadius: '6px',
                overflow: 'hidden',
                background: '#2A1730',
              }}
            >
              {' '}
              {/* La photo seule, recadrée au format du cadre. L'ancienne
                  image était une capture du canevas : la fausse carte « Score
                  du couple 248 » et le bord de la maquette y étaient gravés
                  dans les pixels (retirée le 16/10/2026). */}
              <img
                src="/images/hero-couple-portrait.webp"
                alt="Un couple regarde son téléphone en riant"
                width={820}
                height={911}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: '50% 30%',
                  display: 'block',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: '0',
                  background: 'linear-gradient(to top,rgba(23,13,27,.34),rgba(23,13,27,0) 26%)',
                  pointerEvents: 'none',
                }}
              ></div>
            </div>
          </div>
        </section>
        <div
          style={{
            position: 'relative',
            zIndex: '3',
            borderTop: '1px solid rgba(246,238,230,.1)',
            borderBottom: '1px solid rgba(246,238,230,.1)',
          }}
        >
          {' '}
          <div
            style={{
              maxWidth: '1440px',
              margin: '0 auto',
              padding: 'clamp(30px,4vw,44px) clamp(20px,5vw,72px)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(200px, 100%),1fr))',
              gap: 'clamp(18px,3vw,40px)',
              fontSize: '16px',
              color: 'rgba(246,238,230,.7)',
            }}
          >
            {' '}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
              <span
                style={{
                  fontFamily: "'Instrument Serif',serif",
                  fontSize: '30px',
                  color: '#E8B860',
                  lineHeight: '1',
                }}
              >
                {TOTAL_QUESTIONS}
              </span>
              <span>questions dans le jeu</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
              <span
                style={{
                  fontFamily: "'Instrument Serif',serif",
                  fontSize: '30px',
                  color: '#E8B860',
                  lineHeight: '1',
                }}
              >
                8
              </span>
              <span>thèmes au choix</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
              <span
                style={{
                  fontFamily: "'Instrument Serif',serif",
                  fontSize: '30px',
                  color: '#E8B860',
                  lineHeight: '1',
                }}
              >
                12
              </span>
              <span>minutes par partie, environ</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
              <span
                style={{
                  fontFamily: "'Instrument Serif',serif",
                  fontSize: '30px',
                  color: '#E8B860',
                  lineHeight: '1',
                }}
              >
                1
              </span>
              <span>score commun pour le couple</span>
            </div>
          </div>
        </div>
        <section
          id="film"
          style={{
            position: 'relative',
            zIndex: '3',
            maxWidth: '1440px',
            margin: '0 auto',
            padding: 'clamp(56px,7vw,100px) clamp(20px,5vw,72px) 0',
          }}
        >
          {' '}
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            {' '}
            <div
              style={{
                fontSize: '12px',
                letterSpacing: '.16em',
                textTransform: 'uppercase',
                color: '#E8B860',
                marginBottom: '16px',
              }}
            >
              Le film · 20 secondes
            </div>
            <h2
              style={{
                fontFamily: "'Instrument Serif',serif",
                fontWeight: '400',
                fontSize: 'clamp(32px,4.2vw,56px)',
                lineHeight: '1.05',
                margin: '0 0 clamp(24px,3vw,36px)',
              }}
            >
              Cœur Fidèle, en vingt secondes
            </h2>
            <FilmPub />
          </div>
        </section>
        {/*
          L'essentiel — ce qui remplace, depuis le 14/10/2026, les dix sections
          de présentation (démo animée, jeu détaillé, à distance, rituel,
          aperçu, catégories, Salon, témoignages, règles, pour qui). La page
          mesurait 21 écrans sur téléphone et les tarifs n'arrivaient qu'au
          seizième : on s'inscrit plus vite quand on n'a pas à les chercher.
          Chaque carte dit ce que le code fait, rien de plus, et les garde-fous
          d'avant tiennent toujours — deux téléphones, mais tour à tour
          (categories.test.ts), un Salon jamais dit gratuit
          (tarifs-derives.test.ts).
        */}
        <section
          id="essentiel"
          style={{
            position: 'relative',
            zIndex: '3',
            maxWidth: '1440px',
            margin: '0 auto',
            padding: 'clamp(48px,6vw,88px) clamp(20px,5vw,72px)',
          }}
        >
          {' '}
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            {' '}
            <div
              style={{
                fontSize: '12px',
                letterSpacing: '.16em',
                textTransform: 'uppercase',
                color: '#E8B860',
                marginBottom: '16px',
              }}
            >
              L'essentiel
            </div>
            <h2
              style={{
                fontFamily: "'Instrument Serif',serif",
                fontWeight: '400',
                fontSize: 'clamp(32px,4.2vw,56px)',
                lineHeight: '1.05',
                margin: '0 0 clamp(24px,3vw,36px)',
              }}
            >
              Ce que contient Cœur Fidèle
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(min(230px, 100%),1fr))',
                gap: '14px',
              }}
            >
              {' '}
              {essentiel.map((carte) => (
                <div
                  key={carte.titre}
                  style={{
                    border: '1px solid rgba(246,238,230,.14)',
                    background: '#1E1124',
                    padding: '22px 22px 24px',
                  }}
                  className="cf-h3"
                >
                  {' '}
                  <div
                    style={{
                      fontSize: '12px',
                      letterSpacing: '.14em',
                      textTransform: 'uppercase',
                      color: '#E8B860',
                    }}
                  >
                    {carte.titre}
                  </div>
                  <h3
                    style={{
                      fontFamily: "'Instrument Serif',serif",
                      fontWeight: '400',
                      fontSize: '26px',
                      lineHeight: '1.1',
                      margin: '10px 0',
                    }}
                  >
                    {carte.accroche}
                  </h3>
                  <p
                    style={{
                      fontSize: '15px',
                      lineHeight: '1.55',
                      color: 'rgba(246,238,230,.7)',
                      margin: '0',
                    }}
                  >
                    {carte.texte}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section
          id="prix"
          style={{
            position: 'relative',
            zIndex: '3',
            maxWidth: '1440px',
            margin: '0 auto',
            padding: '0 clamp(20px,5vw,72px) clamp(64px,8vw,120px)',
          }}
        >
          {' '}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: '20px',
              marginBottom: 'clamp(30px,4vw,50px)',
            }}
          >
            {' '}
            <h2
              style={{
                fontFamily: "'Instrument Serif',serif",
                fontWeight: '400',
                fontSize: 'clamp(34px,4.4vw,60px)',
                lineHeight: '1.05',
                margin: '0',
              }}
            >
              La première partie est offerte.
              <br />
              Ensuite, choisissez un pack.
            </h2>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(290px, 100%),1fr))',
              gap: '20px',
              alignItems: 'stretch',
            }}
            className="cf-tarifs"
          >
            {' '}
            {/* Une seule carte, répétée. Les trois étaient écrites à la main,
                et c'est par là qu'elles ont dérivé du registre : l'accueil
                annonçait « Essentiel · par mois · 6 thèmes sur 8 » quand la
                caisse vendait « Semaine · 7 jours · les huit thèmes », et
                proposait encore l'Annuel retiré de la vente. Tout vient
                maintenant de `pricingCards`, donc d'un seul endroit. */}
            {pricingCards.map((card) => (
              <div
                key={card.id}
                style={{
                  border: card.misEnAvant
                    ? '1px solid rgba(232,184,96,.75)'
                    : '1px solid rgba(246,238,230,.12)',
                  ...(card.misEnAvant ? { background: '#33192F' } : {}),
                  borderRadius: '6px',
                  padding: 'clamp(28px,3vw,38px)',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                }}
                className="cf-tarif"
              >
                {card.misEnAvant && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '-13px',
                      left: '32px',
                      background: '#E8B860',
                      color: '#170D1B',
                      fontSize: '12px',
                      fontWeight: '700',
                      letterSpacing: '.08em',
                      textTransform: 'uppercase',
                      padding: '6px 13px',
                      borderRadius: '4px',
                    }}
                  >
                    Recommandé
                  </div>
                )}
                <div
                  style={{
                    fontSize: '13px',
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: card.misEnAvant ? '#E8B860' : 'rgba(246,238,230,.64)',
                  }}
                  className="cf-tarif-nom"
                >
                  {card.nom}
                </div>
                <div
                  style={{
                    fontFamily: "'Instrument Serif',serif",
                    fontSize: '52px',
                    lineHeight: '1.1',
                    margin: '18px 0 6px',
                  }}
                  className="cf-tarif-prix"
                >
                  {card.prix}
                </div>
                <div
                  style={{
                    fontSize: '15px',
                    color: 'rgba(246,238,230,.66)',
                    marginBottom: '24px',
                  }}
                  className="cf-tarif-mention"
                >
                  {card.mention}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    fontSize: '16px',
                    color: 'rgba(246,238,230,.78)',
                    marginBottom: '28px',
                  }}
                  className="cf-tarif-details"
                >
                  {card.details.map((ligne) => (
                    <div key={ligne}>{ligne}</div>
                  ))}
                </div>
                <a
                  href={card.gratuit ? PLAY_HREF : cheminAchat(card.id)}
                  style={{
                    marginTop: 'auto',
                    textAlign: 'center',
                    padding: '15px',
                    borderRadius: '4px',
                    ...(card.misEnAvant
                      ? { background: '#E8B860', color: '#170D1B', fontWeight: '700' }
                      : {
                          border: '1px solid rgba(246,238,230,.26)',
                          color: '#F6EEE6',
                          fontWeight: '600',
                        }),
                  }}
                  className={`${card.misEnAvant ? 'cf-h2' : 'cf-h5'} cf-tarif-cta`}
                >
                  {card.ctaLabel}
                </a>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '22px', fontSize: '15px', color: 'rgba(246,238,230,.64)' }}>
            {/* La phrase du canevas — « les points ne sont jamais débités » —
                décrivait une monnaie inexistante. Elle a ensuite cédé la place à
                « rien n'est débitable aujourd'hui », vrai jusqu'au 13/10/2026 :
                depuis, PayTech encaisse, et chaque carte payante ouvre sa caisse.
                Ne nommer ici que les moyens que PayTech propose réellement. */}
            Paiement sécurisé par PayTech : {MOYENS_DE_PAIEMENT}. Le pack s'ouvre dès que le
            paiement est confirmé.
          </div>
        </section>
        <section
          id="faq"
          style={{
            position: 'relative',
            zIndex: '3',
            maxWidth: '1440px',
            margin: '0 auto',
            padding: '0 clamp(20px,5vw,72px) clamp(64px,8vw,120px)',
          }}
        >
          {' '}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: '24px',
              marginBottom: 'clamp(34px,4vw,54px)',
            }}
          >
            {' '}
            <div>
              {' '}
              <div
                style={{
                  fontSize: '13px',
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  color: '#E8B860',
                  marginBottom: '18px',
                }}
              >
                Questions fréquentes
              </div>
              <h2
                style={{
                  fontFamily: "'Instrument Serif',serif",
                  fontWeight: '400',
                  fontSize: 'clamp(34px,4.4vw,60px)',
                  lineHeight: '1.05',
                  margin: '0',
                  maxWidth: '14em',
                }}
              >
                Avant de commencer
              </h2>
            </div>
          </div>
          {/* 460 px et non 330 : avec quatre questions, trois colonnes
              laissaient la quatrième seule sur sa ligne. Deux colonnes
              donnent un carré 2 × 2 ; une seule sur téléphone. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(460px, 100%),1fr))',
              gap: '16px',
            }}
          >
            {' '}
            {faqEssentielle.map((item, k9) => (
              <Fragment key={k9}>
                <div
                  style={{
                    background: '#221029',
                    border: '1px solid rgba(246,238,230,.08)',
                    borderRadius: '6px',
                    padding: 'clamp(24px,2.4vw,30px)',
                    display: 'flex',
                    gap: '18px',
                  }}
                  className="cf-h3"
                >
                  {' '}
                  <div
                    style={{
                      fontFamily: "'Instrument Serif',serif",
                      fontSize: '24px',
                      color: '#E8B860',
                      lineHeight: '1.1',
                      flexShrink: '0',
                    }}
                  >
                    {String(k9 + 1).padStart(2, '0')}
                  </div>
                  <div>
                    {' '}
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: '600',
                        marginBottom: '10px',
                        lineHeight: '1.3',
                      }}
                    >
                      {item.q}
                    </div>
                    <div
                      style={{
                        fontSize: '16px',
                        lineHeight: '1.55',
                        color: 'rgba(246,238,230,.72)',
                      }}
                    >
                      {item.a}
                    </div>
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        </section>
        <section
          style={{
            position: 'relative',
            zIndex: '3',
            maxWidth: '1440px',
            margin: '0 auto',
            padding: '0 clamp(20px,5vw,72px) clamp(70px,8vw,120px)',
          }}
        >
          {' '}
          <div
            style={{
              borderRadius: '6px',
              background: '#8B2C56',
              padding: 'clamp(40px,6vw,80px)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(280px, 100%),1fr))',
              gap: '36px',
              alignItems: 'center',
            }}
          >
            {' '}
            <div>
              {' '}
              <h2
                style={{
                  fontFamily: "'Instrument Serif',serif",
                  fontWeight: '400',
                  fontSize: 'clamp(34px,4.6vw,62px)',
                  lineHeight: '1.03',
                  margin: '0 0 18px',
                }}
              >
                Prêts pour votre première partie ?
              </h2>
              <p
                style={{
                  fontSize: '17px',
                  lineHeight: '1.55',
                  color: 'rgba(246,238,230,.78)',
                  margin: '0',
                  maxWidth: '30em',
                }}
              >
                Créez votre Espace Couple, puis envoyez l’invitation à votre partenaire.
                L’inscription se fait par email, avec un code de vérification à 8 caractères.
              </p>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                maxWidth: '400px',
                justifySelf: 'end',
                width: '100%',
              }}
            >
              {' '}
              <a
                href={SIGN_UP_HREF}
                style={{
                  textAlign: 'center',
                  padding: '18px',
                  borderRadius: '4px',
                  background: '#F6EEE6',
                  color: '#170D1B',
                  fontWeight: '700',
                  fontSize: '17px',
                }}
                className="cf-h1"
              >
                {ctaLabel}
              </a>
              <div
                style={{ textAlign: 'center', fontSize: '14px', color: 'rgba(246,238,230,.62)' }}
              >
                Réservé aux 18 ans et plus
              </div>
            </div>
          </div>
        </section>
        <footer
          style={{
            position: 'relative',
            zIndex: '3',
            borderTop: '1px solid rgba(246,238,230,.12)',
          }}
        >
          {' '}
          <div
            style={{
              maxWidth: '1440px',
              margin: '0 auto',
              padding: '36px clamp(20px,5vw,72px)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '24px',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '14px',
              color: 'rgba(246,238,230,.64)',
            }}
          >
            {' '}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {' '}
              <div
                style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#E8B860' }}
              ></div>
              <span
                style={{
                  fontFamily: "'Instrument Serif',serif",
                  fontSize: '19px',
                  color: '#F6EEE6',
                }}
              >
                Cœur Fidèle
              </span>
            </div>
            {/* Absent du canevas (16/10/2026) : les pages de contenu, liées
                d'ici pour que les moteurs les trouvent autrement que par le
                sitemap — voir lib/seo/contenus.ts. */}
            <nav
              aria-label="À découvrir"
              style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 26px', alignItems: 'baseline' }}
            >
              <span
                style={{
                  fontSize: '11px',
                  letterSpacing: '.16em',
                  textTransform: 'uppercase',
                  color: 'rgba(246,238,230,.5)',
                }}
              >
                À découvrir
              </span>
              {PAGES_DE_CONTENU.map((page) => (
                <a key={page.chemin} href={page.chemin} style={{ color: '#E8B860' }}>
                  {page.lien}
                </a>
              ))}
            </nav>
            <div>Vos réponses ne sont jamais revendues.</div>
          </div>
        </footer>
        <div
          style={{
            position: 'sticky',
            bottom: '0',
            zIndex: '20',
            background: '#170D1B',
            borderTop: '1px solid rgba(232,184,96,.35)',
          }}
        >
          {' '}
          <div
            style={{
              maxWidth: '1440px',
              margin: '0 auto',
              padding: '14px clamp(20px,5vw,72px)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
            }}
          >
            {' '}
            <div style={{ fontSize: '15px', color: 'rgba(246,238,230,.82)' }}>
              Première partie offerte, sans carte bancaire.
            </div>
            <a
              href={SIGN_UP_HREF}
              style={{
                padding: '13px 26px',
                borderRadius: '4px',
                background: '#E8B860',
                color: '#170D1B',
                fontWeight: '700',
                fontSize: '15px',
                whiteSpace: 'nowrap',
              }}
              className="cf-h2"
            >
              {ctaLabel}
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
