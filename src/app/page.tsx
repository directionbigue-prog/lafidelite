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
//     Le 13/10/2026 le mode à distance est livré (`lib/video/distance.ts`,
//     appel vidéo Daily) : chacun joue sur son téléphone, TOUR À TOUR, et
//     l'écran de celui qui attend suit la partie. La page le dit à nouveau —
//     mais jamais « en même temps » : le moteur garde une seule
//     `activePlayerRole` à la fois. `categories.test.ts` tient les deux bouts.
//   · LE RITUEL DU JOUR (question du jour, flamme, badges, rappels) et
//     l'APPEL VIDÉO ont chacun leur section, écrite d'après ce que font
//     `lib/rituel/` et `lib/video/` — pas d'après une maquette.
//   · Les liens du footer (Confidentialité, CGU, Support, English) et
//     plusieurs CTA pointent sur « # », comme dans la maquette.
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
import { SignupCard } from '@/components/landing/SignupCard';
import { Marque } from '@/components/ui/Marque';

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
  const {
    ctaLabel,
    otpCells,
    categories,
    checkersBoard,
    wordBoard,
    awaleTop,
    awaleBottom,
    testimonials,
    faq,
    rules,
    zoneLabel,
    pricingCards,
    salonAcces,
  } = buildLandingDesignData();

  return (
    <>
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
            <a href="#jeu" style={{ color: 'inherit' }}>
              Le jeu
            </a>
            <a href="#apercu-anime" style={{ color: 'inherit' }}>
              La démo
            </a>
            <a href="#a-distance" style={{ color: 'inherit' }}>
              À distance
            </a>
            <a href="#rituel" style={{ color: 'inherit' }}>
              Le rituel
            </a>
            <a href="#categories" style={{ color: 'inherit' }}>
              Catégories
            </a>
            <a href="#salon" style={{ color: 'inherit' }}>
              Le Salon
            </a>
            <a href="#regles" style={{ color: 'inherit' }}>
              Nos règles
            </a>
            <a href="#faq" style={{ color: 'inherit' }}>
              FAQ
            </a>
            <a href="#prix" style={{ color: 'inherit' }}>
              Tarifs
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
              Parlez de fidélité
              <br />
              avant d'avoir
              <br />
              <em style={{ color: '#E8B860' }}>à en parler.</em>
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
              Cœur Fidèle est un jeu de couple en 15 questions. Trois manches, un score commun — sur
              un téléphone qu’on se passe, ou chacun sur le sien en se voyant en vidéo, même à des
              milliers de kilomètres. On rit, on se découvre, et on finit la partie du même côté.
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
              <img
                src="/images/hero-couple-landing.png"
                alt="Un couple regarde son téléphone en riant"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  objectPosition: '50% 50%',
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
            <div
              className="cf-badge-left"
              style={{
                position: 'absolute',
                left: '-14px',
                bottom: '0',
                background: 'rgba(23,13,27,.82)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(246,238,230,.12)',
                borderRadius: '6px',
                padding: '20px 24px',
                minWidth: '220px',
              }}
            >
              {' '}
              <div
                style={{
                  fontSize: '11px',
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  color: 'rgba(246,238,230,.64)',
                  marginBottom: '8px',
                }}
              >
                Score du couple
              </div>
              <div
                style={{
                  fontFamily: "'Instrument Serif',serif",
                  fontSize: '40px',
                  lineHeight: '1',
                  color: '#E8B860',
                }}
              >
                248
              </div>
              <div style={{ fontSize: '14px', color: 'rgba(246,238,230,.68)', marginTop: '6px' }}>
                Niveau : Complices
              </div>
            </div>
            <div
              className="cf-badge-right"
              style={{
                position: 'absolute',
                right: '-14px',
                top: '0',
                background: '#E8B860',
                color: '#170D1B',
                borderRadius: '4px',
                padding: '12px 20px',
                fontWeight: '700',
                fontSize: '14px',
                boxShadow: '0 20px 44px -18px rgba(232,184,96,.6)',
              }}
            >
              Cœur d'Or
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
              <span>questions écrites à la main</span>
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
              <span>thèmes, du léger au sérieux</span>
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
              <span>minutes, le temps d'un café</span>
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
                0
              </span>
              <span>gagnant, jamais de perdant</span>
            </div>
          </div>
        </div>
        <section
          id="apercu-anime"
          style={{
            position: 'relative',
            zIndex: '3',
            maxWidth: '1440px',
            margin: '0 auto',
            padding: 'clamp(56px,7vw,100px) clamp(20px,5vw,72px)',
          }}
        >
          {' '}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px, 100%),1fr))',
              gap: 'clamp(32px,4vw,64px)',
              alignItems: 'center',
            }}
          >
            {' '}
            <div>
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
                De l'inscription au score
              </div>
              <h2
                style={{
                  fontFamily: "'Instrument Serif',serif",
                  fontWeight: '400',
                  fontSize: 'clamp(32px,4.2vw,56px)',
                  lineHeight: '1.05',
                  margin: '0 0 18px',
                }}
              >
                Du lien WhatsApp au score, sans rien installer
              </h2>
              <p
                style={{
                  fontSize: '17px',
                  lineHeight: '1.6',
                  color: 'rgba(246,238,230,.7)',
                  maxWidth: '28em',
                  margin: '0 0 26px',
                }}
              >
                Vous créez l'Espace Couple, vous envoyez l'invitation, vous répondez chacun de votre
                côté. Le score arrive à la fin, commun.
              </p>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxWidth: '26em' }}
              >
                {' '}
                <div
                  style={{
                    display: 'flex',
                    gap: '16px',
                    padding: '13px 0',
                    borderTop: '1px solid rgba(246,238,230,.14)',
                  }}
                >
                  <span
                    style={{
                      fontSize: '14px',
                      color: '#E8B860',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    01
                  </span>
                  <span style={{ fontSize: '16px', color: 'rgba(246,238,230,.82)' }}>
                    Votre email, un code à 8 caractères
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '16px',
                    padding: '13px 0',
                    borderTop: '1px solid rgba(246,238,230,.14)',
                  }}
                >
                  <span
                    style={{
                      fontSize: '14px',
                      color: '#E8B860',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    02
                  </span>
                  <span style={{ fontSize: '16px', color: 'rgba(246,238,230,.82)' }}>
                    Le lien part sur WhatsApp
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '16px',
                    padding: '13px 0',
                    borderTop: '1px solid rgba(246,238,230,.14)',
                  }}
                >
                  <span
                    style={{
                      fontSize: '14px',
                      color: '#E8B860',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    03
                  </span>
                  <span style={{ fontSize: '16px', color: 'rgba(246,238,230,.82)' }}>
                    Quinze questions, chacun son écran
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '16px',
                    padding: '13px 0',
                    borderTop: '1px solid rgba(246,238,230,.14)',
                    borderBottom: '1px solid rgba(246,238,230,.14)',
                  }}
                >
                  <span
                    style={{
                      fontSize: '14px',
                      color: '#E8B860',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    04
                  </span>
                  <span style={{ fontSize: '16px', color: 'rgba(246,238,230,.82)' }}>
                    Un score, deux titres, zéro perdant
                  </span>
                </div>
              </div>
            </div>
            <div
              style={{
                border: '1px solid rgba(246,238,230,.16)',
                background: '#1E1124',
                padding: 'clamp(20px,2.2vw,28px)',
              }}
            >
              {' '}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px',
                  marginBottom: '18px',
                }}
              >
                {' '}
                <div
                  style={{
                    fontSize: '12px',
                    letterSpacing: '.16em',
                    textTransform: 'uppercase',
                    color: 'rgba(246,238,230,.66)',
                  }}
                >
                  Cœur Fidèle · démo
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {' '}
                  <span
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: '#8B2C56',
                    }}
                  ></span>
                  <span
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: '#E8B860',
                    }}
                  ></span>
                  <span
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: 'rgba(246,238,230,.3)',
                    }}
                  ></span>
                </div>
              </div>
              <div
                data-stage=""
                style={{
                  position: 'relative',
                  height: 'clamp(300px,34vw,356px)',
                  overflow: 'hidden',
                  background: '#170D1B',
                  border: '1px solid rgba(246,238,230,.1)',
                }}
              >
                {' '}
                <div
                  data-beat=""
                  style={{
                    position: 'absolute',
                    inset: '0',
                    padding: 'clamp(20px,2.4vw,30px)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '16px',
                    animation: 'beat1 14s cubic-bezier(.3,.7,.3,1) infinite',
                  }}
                >
                  {' '}
                  <div
                    style={{
                      fontSize: '12px',
                      letterSpacing: '.16em',
                      textTransform: 'uppercase',
                      color: '#E8B860',
                    }}
                  >
                    Étape 1 · Votre numéro
                  </div>
                  <div
                    style={{
                      fontFamily: "'Instrument Serif',serif",
                      fontSize: 'clamp(24px,2.6vw,32px)',
                      lineHeight: '1.12',
                    }}
                  >
                    Votre email, puis un code à 8 caractères.
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      border: '1px solid rgba(246,238,230,.24)',
                      background: '#1E1124',
                    }}
                  >
                    {' '}
                    <div
                      style={{
                        flex: '1',
                        padding: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        overflow: 'hidden',
                      }}
                    >
                      {' '}
                      <span
                        style={{
                          fontSize: '16px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          display: 'inline-block',
                          animation: 'typeIn 14s steps(16,end) infinite',
                        }}
                      >
                        vous@exemple.com
                      </span>
                      <span
                        style={{
                          width: '2px',
                          height: '18px',
                          background: '#E8B860',
                          animation: 'caretBlink 1s steps(1,end) infinite',
                        }}
                      ></span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {' '}
                    {otpCells.map((d, k1) => (
                      <Fragment key={k1}>
                        <div
                          style={{
                            width: '38px',
                            height: '46px',
                            border: '1px solid rgba(232,184,96,.4)',
                            background: 'rgba(232,184,96,.08)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: "'Instrument Serif',serif",
                            fontSize: '21px',
                            color: '#E8B860',
                          }}
                        >
                          {d.caractere}
                        </div>
                      </Fragment>
                    ))}
                  </div>
                </div>
                <div
                  data-beat=""
                  style={{
                    position: 'absolute',
                    inset: '0',
                    padding: 'clamp(20px,2.4vw,30px)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '16px',
                    animation: 'beat2 14s cubic-bezier(.3,.7,.3,1) infinite',
                  }}
                >
                  {' '}
                  <div
                    style={{
                      fontSize: '12px',
                      letterSpacing: '.16em',
                      textTransform: 'uppercase',
                      color: '#E8B860',
                    }}
                  >
                    Étape 2 · L'invitation
                  </div>
                  <div
                    style={{
                      fontFamily: "'Instrument Serif',serif",
                      fontSize: 'clamp(24px,2.6vw,32px)',
                      lineHeight: '1.12',
                    }}
                  >
                    Un lien, envoyé sur WhatsApp.
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '16px',
                      border: '1px solid rgba(246,238,230,.16)',
                      background: '#1E1124',
                    }}
                  >
                    {' '}
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: 'linear-gradient(140deg,#E8B860,#8B2C56)',
                        flexShrink: '0',
                      }}
                    ></div>
                    <div style={{ flex: '1', minWidth: '0' }}>
                      {' '}
                      <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>
                        Malick
                      </div>
                      <div style={{ fontSize: '14px', color: 'rgba(246,238,230,.7)' }}>
                        a rejoint l'Espace Couple
                      </div>
                    </div>
                    <div
                      style={{
                        width: '30px',
                        height: '30px',
                        border: '1px solid #E8B860',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#E8B860',
                        fontWeight: '700',
                        animation: 'tickIn 14s ease-out infinite',
                      }}
                    >
                      ✓
                    </div>
                  </div>
                  <div
                    style={{ fontSize: '15px', lineHeight: '1.5', color: 'rgba(246,238,230,.7)' }}
                  >
                    Il n'a rien à saisir, rien à installer. Le lien ouvre la partie.
                  </div>
                </div>
                <div
                  data-beat=""
                  style={{
                    position: 'absolute',
                    inset: '0',
                    padding: 'clamp(20px,2.4vw,30px)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '14px',
                    animation: 'beat3 14s cubic-bezier(.3,.7,.3,1) infinite',
                  }}
                >
                  {' '}
                  <div
                    style={{
                      fontSize: '12px',
                      letterSpacing: '.16em',
                      textTransform: 'uppercase',
                      color: '#E8B860',
                    }}
                  >
                    Étape 3 · Chacun son écran
                  </div>
                  <div
                    style={{
                      fontFamily: "'Instrument Serif',serif",
                      fontSize: 'clamp(21px,2.2vw,27px)',
                      lineHeight: '1.18',
                    }}
                  >
                    « Un message d'une ex arrive à minuit. Tu fais quoi ? »
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {' '}
                    <div
                      style={{
                        border: '1px solid rgba(246,238,230,.14)',
                        background: '#1E1124',
                        padding: '12px 14px',
                        fontSize: '15px',
                      }}
                    >
                      Je réponds, sans en parler
                    </div>
                    <div
                      style={{
                        border: '1px solid #E8B860',
                        background: 'rgba(232,184,96,.14)',
                        padding: '12px 14px',
                        fontSize: '15px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '10px',
                      }}
                    >
                      <span>Je montre le message</span>
                      <span
                        style={{
                          color: '#E8B860',
                          fontWeight: '700',
                          animation: 'tickIn 14s ease-out infinite',
                        }}
                      >
                        ✓
                      </span>
                    </div>
                    <div
                      style={{
                        border: '1px solid rgba(246,238,230,.14)',
                        background: '#1E1124',
                        padding: '12px 14px',
                        fontSize: '15px',
                      }}
                    >
                      Je laisse sans répondre
                    </div>
                  </div>
                  <div style={{ fontSize: '14px', color: 'rgba(246,238,230,.66)' }}>
                    Malick a répondu. Vous ne verrez sa réponse qu'à la fin de la manche.
                  </div>
                </div>
                <div
                  data-beat=""
                  style={{
                    position: 'absolute',
                    inset: '0',
                    padding: 'clamp(20px,2.4vw,30px)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '14px',
                    textAlign: 'center',
                    animation: 'beat4 14s cubic-bezier(.3,.7,.3,1) infinite',
                  }}
                >
                  {' '}
                  <div
                    style={{
                      fontSize: '12px',
                      letterSpacing: '.16em',
                      textTransform: 'uppercase',
                      color: 'rgba(246,238,230,.66)',
                    }}
                  >
                    Étape 4 · Votre score de couple
                  </div>
                  <div
                    style={{
                      fontFamily: "'Instrument Serif',serif",
                      fontSize: 'clamp(56px,7vw,84px)',
                      lineHeight: '.88',
                      color: '#E8B860',
                      animation: 'countUp 14s ease-out infinite',
                    }}
                  >
                    312
                  </div>
                  <div
                    style={{
                      alignSelf: 'center',
                      padding: '7px 16px',
                      border: '1px solid rgba(232,184,96,.45)',
                      color: '#E8B860',
                      fontSize: '14px',
                      fontWeight: '600',
                    }}
                  >
                    Niveau Inséparables
                  </div>
                  <div
                    style={{
                      height: '6px',
                      background: 'rgba(246,238,230,.14)',
                      overflow: 'hidden',
                      marginTop: '4px',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        background: '#E8B860',
                        transformOrigin: 'left',
                        animation: 'barGrow 14s cubic-bezier(.2,.8,.3,1) infinite',
                      }}
                    ></div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '14px',
                      color: 'rgba(246,238,230,.72)',
                    }}
                  >
                    {' '}
                    <span>Aïssatou · Cœur d'Or</span>
                    <span>Malick · Cœur Sincère</span>
                  </div>
                </div>
              </div>
              <div
                data-track-wrap=""
                style={{
                  height: '2px',
                  background: 'rgba(246,238,230,.14)',
                  marginTop: '18px',
                  overflow: 'hidden',
                }}
              >
                {' '}
                <div
                  data-track=""
                  style={{
                    height: '100%',
                    background: '#E8B860',
                    transformOrigin: 'left',
                    animation: 'trackFill 14s linear infinite',
                  }}
                ></div>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '10px',
                  marginTop: '12px',
                  fontSize: '13px',
                  color: 'rgba(246,238,230,.6)',
                }}
              >
                {' '}
                <span>Numéro</span>
                <span>Invitation</span>
                <span>Questions</span>
                <span>Score</span>
              </div>
            </div>
          </div>
        </section>
        <section
          id="jeu"
          style={{
            position: 'relative',
            zIndex: '3',
            maxWidth: '1440px',
            margin: '0 auto',
            padding: 'clamp(64px,8vw,120px) clamp(20px,5vw,72px)',
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
              marginBottom: 'clamp(36px,5vw,60px)',
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
                maxWidth: '14em',
              }}
            >
              Trois manches, et vous êtes toujours dans la même équipe
            </h2>
            <p
              style={{
                fontSize: '16px',
                color: 'rgba(246,238,230,.7)',
                maxWidth: '26em',
                margin: '0',
              }}
            >
              Un téléphone que vous vous passez, ou chacun le sien à distance, tour à tour. Dans les
              deux cas, aucune réponse n’apparaît avant la fin de la manche.
            </p>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(280px, 100%),1fr))',
              gap: '20px',
            }}
          >
            {' '}
            <div
              style={{
                background: '#221029',
                border: '1px solid rgba(246,238,230,.08)',
                borderRadius: '6px',
                padding: 'clamp(28px,3vw,38px)',
              }}
              className="cf-h3"
            >
              {' '}
              <div
                style={{
                  fontFamily: "'Instrument Serif',serif",
                  fontSize: '46px',
                  color: '#E8B860',
                  lineHeight: '1',
                }}
              >
                01
              </div>
              <h3 style={{ fontSize: '22px', fontWeight: '600', margin: '16px 0 12px' }}>Miroir</h3>
              <p
                style={{
                  fontSize: '16px',
                  lineHeight: '1.6',
                  color: 'rgba(246,238,230,.66)',
                  margin: '0 0 20px',
                }}
              >
                Vous devinez ce que l'autre va répondre. « Un message d'un ex à minuit : il fait
                quoi ? »
              </p>
              <div
                style={{
                  fontSize: '13px',
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'rgba(246,238,230,.42)',
                }}
              >
                Mesure la connaissance
              </div>
            </div>
            <div
              style={{
                background: '#33192F',
                border: '1px solid rgba(232,184,96,.28)',
                borderRadius: '6px',
                padding: 'clamp(28px,3vw,38px)',
              }}
            >
              {' '}
              <div
                style={{
                  fontFamily: "'Instrument Serif',serif",
                  fontSize: '46px',
                  color: '#E8B860',
                  lineHeight: '1',
                }}
              >
                02
              </div>
              <h3 style={{ fontSize: '22px', fontWeight: '600', margin: '16px 0 12px' }}>
                Scénarios
              </h3>
              <p
                style={{
                  fontSize: '16px',
                  lineHeight: '1.6',
                  color: 'rgba(246,238,230,.66)',
                  margin: '0 0 20px',
                }}
              >
                Des situations de tous les jours, plusieurs façons d'y réagir. C'est ici que se
                construit votre score.
              </p>
              <div
                style={{
                  fontSize: '13px',
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: '#E8B860',
                }}
              >
                Le cœur du jeu
              </div>
            </div>
            <div
              style={{
                background: '#221029',
                border: '1px solid rgba(246,238,230,.08)',
                borderRadius: '6px',
                padding: 'clamp(28px,3vw,38px)',
              }}
              className="cf-h3"
            >
              {' '}
              <div
                style={{
                  fontFamily: "'Instrument Serif',serif",
                  fontSize: '46px',
                  color: '#E8B860',
                  lineHeight: '1',
                }}
              >
                03
              </div>
              <h3 style={{ fontSize: '22px', fontWeight: '600', margin: '16px 0 12px' }}>
                Face à face
              </h3>
              <p
                style={{
                  fontSize: '16px',
                  lineHeight: '1.6',
                  color: 'rgba(246,238,230,.66)',
                  margin: '0 0 20px',
                }}
              >
                La même question pour vous deux. Personne ne joue contre personne : les points sont
                à vous deux.
              </p>
              <div
                style={{
                  fontSize: '13px',
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'rgba(246,238,230,.42)',
                }}
              >
                Mesure l'alignement
              </div>
            </div>
          </div>
        </section>
        {/*
          À distance — l'appel vidéo et le jeu sur deux téléphones. Chaque
          phrase correspond à du code : salle Daily privée à deux places sans
          enregistrement (`server/video/daily.ts`), écran d'attente qui suit la
          partie (`lib/video/distance.ts`), secret des réponses inchangé
          (`game/response-shaping.ts`). Le jeu se joue tour à tour, et cette
          section ne promet rien d'autre (voir categories.test.ts).
        */}
        <section
          id="a-distance"
          style={{
            position: 'relative',
            zIndex: '3',
            maxWidth: '1440px',
            margin: '0 auto',
            padding: 'clamp(64px,8vw,120px) clamp(20px,5vw,72px)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(340px, 100%),1fr))',
              gap: 'clamp(32px,4vw,64px)',
              alignItems: 'center',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '13px',
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: '#E8B860',
                  marginBottom: '18px',
                }}
              >
                Nouveau · Appel vidéo
              </div>
              <h2
                style={{
                  fontFamily: "'Instrument Serif',serif",
                  fontWeight: '400',
                  fontSize: 'clamp(34px,4.4vw,60px)',
                  lineHeight: '1.05',
                  margin: '0 0 20px',
                  maxWidth: '13em',
                }}
              >
                Elle à Paris, lui à Dakar. <em style={{ color: '#E8B860' }}>Même partie.</em>
              </h2>
              <p
                style={{
                  fontSize: '17px',
                  lineHeight: '1.6',
                  color: 'rgba(246,238,230,.7)',
                  maxWidth: '30em',
                  margin: '0',
                }}
              >
                Lancez l’appel vidéo depuis votre Espace Couple : vous vous voyez, vous vous
                entendez, et chacun joue sur son téléphone, tour à tour. Quand c’est à l’autre de
                répondre, votre écran affiche « Awa répond… » et avance tout seul dès qu’elle a
                joué.
              </p>
            </div>
            <div style={{ display: 'grid', gap: '16px' }}>
              {[
                {
                  titre: 'Une salle rien qu’à vous deux',
                  texte:
                    'Personne d’autre ne peut y entrer : l’accès est donné par Cœur Fidèle, à vous deux seulement. L’appel n’est jamais enregistré.',
                },
                {
                  titre: 'Rien à installer',
                  texte:
                    'L’appel s’ouvre dans le navigateur, sur téléphone comme sur ordinateur, et reste à l’écran pendant toute la partie.',
                },
                {
                  titre: 'Le secret tient, même à distance',
                  texte:
                    'La réponse de l’autre reste cachée jusqu’à la fin de la manche, exactement comme sur un seul téléphone.',
                },
              ].map((c) => (
                <div
                  key={c.titre}
                  style={{
                    background: '#221029',
                    border: '1px solid rgba(246,238,230,.08)',
                    borderRadius: '6px',
                    padding: '22px 26px',
                  }}
                >
                  <h3 style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 8px' }}>
                    {c.titre}
                  </h3>
                  <p
                    style={{
                      fontSize: '15px',
                      lineHeight: '1.6',
                      color: 'rgba(246,238,230,.66)',
                      margin: '0',
                    }}
                  >
                    {c.texte}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
        {/*
          Le rituel du jour — d'après `lib/rituel/` : une question MIROIR par
          jour, dévoilée quand les deux ont répondu ; une série qui ne compte
          que les jours À DEUX, avec un jour de grâce tous les sept jours ; douze
          badges et un journal qui ne garde que des dates et des titres ; trois
          mails au plus, sous un seul interrupteur.
        */}
        <section
          id="rituel"
          style={{
            position: 'relative',
            zIndex: '3',
            maxWidth: '1440px',
            margin: '0 auto',
            padding: '0 clamp(20px,5vw,72px) clamp(64px,8vw,120px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: '24px',
              marginBottom: 'clamp(36px,5vw,60px)',
            }}
          >
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
              Une minute par jour, pour ne jamais perdre le fil
            </h2>
            <p
              style={{
                fontSize: '16px',
                color: 'rgba(246,238,230,.7)',
                maxWidth: '26em',
                margin: '0',
              }}
            >
              Les soirs sans douze minutes devant vous, le rituel du jour suffit : une question,
              deux réponses, et votre flamme reste allumée.
            </p>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(240px, 100%),1fr))',
              gap: '20px',
            }}
          >
            {[
              {
                n: '01',
                titre: 'La question du jour',
                texte:
                  'Chaque jour, une nouvelle question. Chacun répond pour soi et devine la réponse de l’autre. Tout se dévoile quand vous avez répondu tous les deux.',
              },
              {
                n: '02',
                titre: 'Votre flamme',
                texte:
                  'Jouez ou répondez ensemble chaque jour pour entretenir votre série. Un soir d’oubli ? Un jour de grâce tous les sept jours la protège.',
              },
              {
                n: '03',
                titre: 'Badges et souvenirs',
                texte:
                  'Premier pas, Télépathes, Flamme éternelle… et un journal de vos moments forts — des dates, jamais vos réponses.',
              },
              {
                n: '04',
                titre: 'Un mot quand il le faut',
                texte:
                  '« Awa a répondu, à votre tour ! » ou « votre flamme vacille ». Jamais plus d’un mail par occasion, et un seul clic pour les couper.',
              },
            ].map((c) => (
              <div
                key={c.n}
                style={{
                  background: '#221029',
                  border: '1px solid rgba(246,238,230,.08)',
                  borderRadius: '6px',
                  padding: 'clamp(24px,2.6vw,32px)',
                }}
              >
                <div
                  style={{
                    fontFamily: "'Instrument Serif',serif",
                    fontSize: '40px',
                    color: '#E8B860',
                    lineHeight: '1',
                  }}
                >
                  {c.n}
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', margin: '14px 0 10px' }}>
                  {c.titre}
                </h3>
                <p
                  style={{
                    fontSize: '15px',
                    lineHeight: '1.6',
                    color: 'rgba(246,238,230,.66)',
                    margin: '0',
                  }}
                >
                  {c.texte}
                </p>
              </div>
            ))}
          </div>
        </section>
        <section
          id="apercu"
          style={{
            position: 'relative',
            zIndex: '3',
            maxWidth: '1440px',
            margin: '0 auto',
            padding: '0 clamp(20px,5vw,72px) clamp(64px,8vw,120px)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px, 100%),1fr))',
            gap: 'clamp(36px,5vw,64px)',
            alignItems: 'center',
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
              Dans l'app
            </div>
            <h2
              style={{
                fontFamily: "'Instrument Serif',serif",
                fontWeight: '400',
                fontSize: 'clamp(34px,4.4vw,60px)',
                lineHeight: '1.05',
                margin: '0 0 20px',
              }}
            >
              Ce que vous avez sous les yeux pendant la partie
            </h2>
            <p
              style={{
                fontSize: '17px',
                lineHeight: '1.6',
                color: 'rgba(246,238,230,.7)',
                maxWidth: '30em',
                margin: '0 0 28px',
              }}
            >
              Une question à la fois, quatre réponses, un chrono discret. À la fin, le score du
              couple s'affiche avant les scores individuels.
            </p>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '30em' }}
            >
              {' '}
              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <span style={{ color: '#E8B860', fontWeight: '700' }}>01</span>
                <span
                  style={{ fontSize: '16px', lineHeight: '1.5', color: 'rgba(246,238,230,.8)' }}
                >
                  Le partenaire voit que vous avez répondu, jamais ce que vous avez répondu.
                </span>
              </div>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <span style={{ color: '#E8B860', fontWeight: '700' }}>02</span>
                <span
                  style={{ fontSize: '16px', lineHeight: '1.5', color: 'rgba(246,238,230,.8)' }}
                >
                  Deux jokers chacun pour passer une question sans perdre de point.
                </span>
              </div>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <span style={{ color: '#E8B860', fontWeight: '700' }}>03</span>
                <span
                  style={{ fontSize: '16px', lineHeight: '1.5', color: 'rgba(246,238,230,.8)' }}
                >
                  Coupure réseau ? La partie vous attend dix minutes.
                </span>
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
              gap: 'clamp(14px,1.6vw,20px)',
              alignItems: 'start',
            }}
          >
            {' '}
            <div
              style={{
                borderRadius: '6px',
                border: '1px solid rgba(246,238,230,.12)',
                background: '#1B0F20',
                padding: '20px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                marginTop: 'clamp(20px,3vw,40px)',
              }}
            >
              {' '}
              <div style={{ display: 'flex', gap: '5px' }}>
                {' '}
                <div
                  style={{ flex: '1', height: '4px', borderRadius: '2px', background: '#E8B860' }}
                ></div>
                <div
                  style={{ flex: '1', height: '4px', borderRadius: '2px', background: '#E8B860' }}
                ></div>
                <div
                  style={{ flex: '1', height: '4px', borderRadius: '2px', background: '#E8B860' }}
                ></div>
                <div
                  style={{
                    flex: '1',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'rgba(246,238,230,.18)',
                  }}
                ></div>
                <div
                  style={{
                    flex: '1',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'rgba(246,238,230,.18)',
                  }}
                ></div>
              </div>
              <div
                style={{
                  fontSize: '12px',
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: '#E8B860',
                }}
              >
                Manche 1 · Miroir
              </div>
              <div
                style={{
                  fontFamily: "'Instrument Serif',serif",
                  fontSize: 'clamp(19px,1.7vw,23px)',
                  lineHeight: '1.2',
                }}
              >
                « Un message d'une ex arrive à minuit. Tu fais quoi ? »
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {' '}
                <div
                  style={{
                    border: '1px solid rgba(246,238,230,.14)',
                    borderRadius: '4px',
                    padding: '12px 14px',
                    fontSize: '14px',
                    background: '#26132C',
                  }}
                >
                  Je réponds, sans en parler
                </div>
                <div
                  style={{
                    border: '1px solid #E8B860',
                    borderRadius: '4px',
                    padding: '12px 14px',
                    fontSize: '14px',
                    background: 'rgba(232,184,96,.14)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <span>Je montre le message</span>
                  <span style={{ color: '#E8B860', fontWeight: '700' }}>✓</span>
                </div>
                <div
                  style={{
                    border: '1px solid rgba(246,238,230,.14)',
                    borderRadius: '4px',
                    padding: '12px 14px',
                    fontSize: '14px',
                    background: '#26132C',
                  }}
                >
                  Je laisse sans répondre
                </div>
              </div>
              <div
                style={{
                  textAlign: 'center',
                  padding: '13px',
                  borderRadius: '4px',
                  background: '#E8B860',
                  color: '#170D1B',
                  fontWeight: '700',
                  fontSize: '15px',
                }}
              >
                Valider
              </div>
            </div>
            <div
              style={{
                borderRadius: '6px',
                border: '1px solid rgba(232,184,96,.3)',
                background: '#33192F',
                padding: '22px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                textAlign: 'center',
              }}
            >
              {' '}
              <div
                style={{
                  fontSize: '11px',
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  color: 'rgba(246,238,230,.64)',
                }}
              >
                Votre score de couple
              </div>
              <div
                style={{
                  fontFamily: "'Instrument Serif',serif",
                  fontSize: 'clamp(46px,5vw,64px)',
                  lineHeight: '.9',
                  color: '#E8B860',
                }}
              >
                312
              </div>
              <div
                style={{
                  alignSelf: 'center',
                  padding: '7px 16px',
                  borderRadius: '4px',
                  background: 'rgba(232,184,96,.16)',
                  color: '#E8B860',
                  fontSize: '14px',
                  fontWeight: '600',
                }}
              >
                Inséparables
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  textAlign: 'left',
                  marginTop: '6px',
                }}
              >
                {' '}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: '4px',
                    background: 'rgba(23,13,27,.45)',
                  }}
                >
                  {' '}
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: 'linear-gradient(140deg,#8B2C56,#E8B860)',
                      flexShrink: '0',
                    }}
                  ></div>
                  <div style={{ flex: '1', fontSize: '14px' }}>Aïssatou</div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: '19px' }}>
                    164
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: '4px',
                    background: 'rgba(23,13,27,.45)',
                  }}
                >
                  {' '}
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: 'linear-gradient(140deg,#E8B860,#8B2C56)',
                      flexShrink: '0',
                    }}
                  ></div>
                  <div style={{ flex: '1', fontSize: '14px' }}>Malick</div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: '19px' }}>
                    148
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section
          id="categories"
          style={{ position: 'relative', zIndex: '3', background: '#F6EEE6', color: '#241129' }}
        >
          {' '}
          <div
            style={{
              maxWidth: '1440px',
              margin: '0 auto',
              padding: 'clamp(64px,8vw,120px) clamp(20px,5vw,72px)',
            }}
          >
            {' '}
            <h2
              style={{
                fontFamily: "'Instrument Serif',serif",
                fontWeight: '400',
                fontSize: 'clamp(34px,4.4vw,60px)',
                lineHeight: '1.05',
                margin: '0 0 14px',
              }}
            >
              {TOTAL_QUESTIONS} questions, huit territoires
            </h2>
            <p
              style={{
                fontSize: '17px',
                color: 'rgba(36,17,41,.76)',
                maxWidth: '34em',
                margin: '0 0 clamp(34px,4vw,56px)',
              }}
            >
              Les mêmes fondations partout, mais des questions réécrites région par région. Un
              couple à Abidjan et un couple à Montréal ne se demandent pas la même chose.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(min(240px, 100%),1fr))',
                gap: '1px',
                border: '1px solid rgba(36,17,41,.14)',
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              {' '}
              {categories.map((cat, k2) => (
                <Fragment key={k2}>
                  <div
                    style={{
                      background: '#F6EEE6',
                      boxShadow: '0 0 0 1px rgba(36,17,41,.14)',
                      padding: '26px 24px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      minHeight: '132px',
                    }}
                    className="cf-h4"
                  >
                    {' '}
                    <div
                      style={{
                        fontSize: '12px',
                        letterSpacing: '.12em',
                        textTransform: 'uppercase',
                        color: cat.tint,
                        fontWeight: '600',
                      }}
                    >
                      {cat.access}
                    </div>
                    <div
                      style={{
                        fontFamily: "'Instrument Serif',serif",
                        fontSize: '25px',
                        lineHeight: '1.15',
                      }}
                    >
                      {cat.name}
                    </div>
                    <div
                      style={{ fontSize: '14px', color: 'rgba(36,17,41,.72)', marginTop: 'auto' }}
                    >
                      {cat.count} questions
                    </div>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        </section>
        <section
          id="salon"
          style={{
            position: 'relative',
            zIndex: '3',
            background: '#1C0F22',
            borderTop: '1px solid rgba(246,238,230,.1)',
            borderBottom: '1px solid rgba(246,238,230,.1)',
            overflow: 'hidden',
          }}
        >
          {' '}
          <div
            style={{
              position: 'absolute',
              inset: '0',
              backgroundImage:
                'radial-gradient(circle,rgba(232,184,96,.09) 0 1.5px,transparent 1.5px),radial-gradient(circle,transparent 0 13px,rgba(232,184,96,.05) 13px 14px,transparent 14px)',
              backgroundSize: '34px 34px,68px 68px',
              backgroundPosition: '0 0,17px 17px',
              pointerEvents: 'none',
            }}
          ></div>
          <div
            style={{
              position: 'relative',
              maxWidth: '1440px',
              margin: '0 auto',
              padding: 'clamp(64px,8vw,120px) clamp(20px,5vw,72px)',
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
                marginBottom: 'clamp(36px,5vw,60px)',
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
                  Le Salon
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
                  Quatre jeux pour les soirs où on ne veut pas parler de nous
                </h2>
              </div>
              <p
                style={{
                  fontSize: '16px',
                  lineHeight: '1.6',
                  color: 'rgba(246,238,230,.7)',
                  maxWidth: '26em',
                  margin: '0',
                }}
              >
                Ludo, dames, mots croisés, awalé. Ils ne comptent pas dans votre Score de Fidélité —
                c'est le seul endroit de l'app où il y a un gagnant. Trois victoires d'affilée et
                votre prochaine partie Cœur Fidèle est offerte.
              </p>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(min(340px, 100%),1fr))',
                gap: '20px',
                maxWidth: '1000px',
              }}
            >
              {' '}
              <div
                style={{
                  background: '#221029',
                  border: '1px solid rgba(232,184,96,.28)',
                  borderRadius: '6px',
                  padding: 'clamp(24px,2.4vw,30px)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '22px',
                }}
              >
                {' '}
                <div
                  style={{
                    aspectRatio: '1',
                    width: '100%',
                    maxWidth: '300px',
                    boxSizing: 'border-box',
                    margin: '0 auto',
                    borderRadius: '5px',
                    background: '#F6EEE6',
                    padding: '10px',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)',
                    gridTemplateRows: '1fr 1fr 1fr',
                    gap: '6px',
                  }}
                >
                  {' '}
                  <div style={{ borderRadius: '3px', background: '#8B2C56' }}></div>
                  <div
                    style={{
                      borderRadius: '8px',
                      background: '#EFE3D6',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px',
                      padding: '7px',
                    }}
                  >
                    <div style={{ flex: '1', borderRadius: '3px', background: '#F6EEE6' }}></div>
                    <div style={{ flex: '1', borderRadius: '3px', background: '#E8B860' }}></div>
                    <div style={{ flex: '1', borderRadius: '3px', background: '#F6EEE6' }}></div>
                  </div>
                  <div style={{ borderRadius: '3px', background: '#E8B860' }}></div>
                  <div
                    style={{
                      borderRadius: '8px',
                      background: '#EFE3D6',
                      display: 'flex',
                      gap: '3px',
                      padding: '7px',
                    }}
                  >
                    <div style={{ flex: '1', borderRadius: '3px', background: '#F6EEE6' }}></div>
                    <div style={{ flex: '1', borderRadius: '3px', background: '#8B2C56' }}></div>
                    <div style={{ flex: '1', borderRadius: '3px', background: '#F6EEE6' }}></div>
                  </div>
                  <div
                    style={{
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg,#8B2C56,#E8B860)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: "'Instrument Serif',serif",
                      fontSize: '22px',
                      color: '#F6EEE6',
                    }}
                  >
                    ♥
                  </div>
                  <div
                    style={{
                      borderRadius: '8px',
                      background: '#EFE3D6',
                      display: 'flex',
                      gap: '3px',
                      padding: '7px',
                    }}
                  >
                    <div style={{ flex: '1', borderRadius: '3px', background: '#F6EEE6' }}></div>
                    <div style={{ flex: '1', borderRadius: '3px', background: '#E8B860' }}></div>
                    <div style={{ flex: '1', borderRadius: '3px', background: '#F6EEE6' }}></div>
                  </div>
                  <div style={{ borderRadius: '3px', background: '#3A1B33' }}></div>
                  <div
                    style={{
                      borderRadius: '8px',
                      background: '#EFE3D6',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px',
                      padding: '7px',
                    }}
                  >
                    <div style={{ flex: '1', borderRadius: '3px', background: '#F6EEE6' }}></div>
                    <div style={{ flex: '1', borderRadius: '3px', background: '#8B2C56' }}></div>
                    <div style={{ flex: '1', borderRadius: '3px', background: '#F6EEE6' }}></div>
                  </div>
                  <div style={{ borderRadius: '3px', background: '#241129' }}></div>
                </div>
                <div>
                  {' '}
                  <h3 style={{ fontSize: '22px', fontWeight: '600', margin: '0 0 10px' }}>Ludo</h3>
                  <p
                    style={{
                      fontSize: '15px',
                      lineHeight: '1.55',
                      color: 'rgba(246,238,230,.7)',
                      margin: '0 0 16px',
                    }}
                  >
                    Le classique de la cour familiale, en tour par tour. Dix minutes, quatre pions,
                    un dé.
                  </p>
                  <div
                    style={{
                      fontSize: '13px',
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                      color: '#E8B860',
                    }}
                  >
                    {salonAcces}
                  </div>
                </div>
              </div>
              <div
                style={{
                  background: '#221029',
                  border: '1px solid rgba(246,238,230,.08)',
                  borderRadius: '6px',
                  padding: 'clamp(24px,2.4vw,30px)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '22px',
                }}
                className="cf-h3"
              >
                {' '}
                <div
                  style={{
                    aspectRatio: '1',
                    width: '100%',
                    maxWidth: '300px',
                    boxSizing: 'border-box',
                    margin: '0 auto',
                    borderRadius: '5px',
                    overflow: 'hidden',
                    border: '5px solid #241129',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(8,1fr)',
                    gridTemplateRows: 'repeat(8,1fr)',
                  }}
                >
                  {' '}
                  {checkersBoard.map((sq, k3) => (
                    <Fragment key={k3}>
                      <div
                        style={{
                          background: sq.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {' '}
                        {sq.piece ? (
                          <>
                            <div
                              style={{
                                width: '72%',
                                height: '72%',
                                borderRadius: '50%',
                                background: sq.pieceBg,
                                border: `1px solid ${sq.pieceRing}`,
                              }}
                            ></div>
                          </>
                        ) : null}
                      </div>
                    </Fragment>
                  ))}
                </div>
                <div>
                  {' '}
                  <h3 style={{ fontSize: '22px', fontWeight: '600', margin: '0 0 10px' }}>
                    Jeu de dames
                  </h3>
                  <p
                    style={{
                      fontSize: '15px',
                      lineHeight: '1.55',
                      color: 'rgba(246,238,230,.7)',
                      margin: '0 0 16px',
                    }}
                  >
                    Damier de 64 cases, prise obligatoire. Assez court pour tenir entre deux plats.
                  </p>
                  <div
                    style={{
                      fontSize: '13px',
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                      color: 'rgba(246,238,230,.62)',
                    }}
                  >
                    {salonAcces}
                  </div>
                </div>
              </div>
              <div
                style={{
                  background: '#221029',
                  border: '1px solid rgba(246,238,230,.08)',
                  borderRadius: '6px',
                  padding: 'clamp(24px,2.4vw,30px)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '22px',
                }}
                className="cf-h3"
              >
                {' '}
                <div
                  style={{
                    aspectRatio: '1',
                    width: '100%',
                    maxWidth: '300px',
                    boxSizing: 'border-box',
                    margin: '0 auto',
                    borderRadius: '5px',
                    background: '#241129',
                    border: '1px solid rgba(246,238,230,.12)',
                    padding: '8px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(9,1fr)',
                    gridTemplateRows: 'repeat(9,1fr)',
                    gap: '3px',
                  }}
                >
                  {' '}
                  {wordBoard.map((c, k4) => (
                    <Fragment key={k4}>
                      <div
                        style={{
                          borderRadius: '3px',
                          background: c.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: '700',
                          color: c.fg,
                        }}
                      >
                        {c.letter}
                      </div>
                    </Fragment>
                  ))}
                </div>
                <div>
                  {' '}
                  <h3 style={{ fontSize: '22px', fontWeight: '600', margin: '0 0 10px' }}>
                    Mots croisés
                  </h3>
                  <p
                    style={{
                      fontSize: '15px',
                      lineHeight: '1.55',
                      color: 'rgba(246,238,230,.7)',
                      margin: '0 0 16px',
                    }}
                  >
                    Sept lettres au chevalet, une grille de 81 cases. Le vocabulaire est en
                    français.
                  </p>
                  <div
                    style={{
                      fontSize: '13px',
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                      color: 'rgba(246,238,230,.62)',
                    }}
                  >
                    {salonAcces}
                  </div>
                </div>
              </div>
              <div
                style={{
                  background: '#221029',
                  border: '1px solid rgba(246,238,230,.08)',
                  borderRadius: '6px',
                  padding: 'clamp(24px,2.4vw,30px)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '22px',
                }}
                className="cf-h3"
              >
                {' '}
                <div
                  style={{
                    aspectRatio: '1',
                    width: '100%',
                    maxWidth: '300px',
                    boxSizing: 'border-box',
                    margin: '0 auto',
                    borderRadius: '5px',
                    background: '#3D2036',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  {' '}
                  <div
                    style={{
                      flex: '1',
                      borderRadius: '4px',
                      background: 'rgba(42,20,48,.72)',
                      border: '1px solid rgba(246,238,230,.1)',
                      padding: '0 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    {' '}
                    <span
                      style={{
                        fontSize: '11px',
                        letterSpacing: '.14em',
                        textTransform: 'uppercase',
                        color: 'rgba(246,238,230,.66)',
                      }}
                    >
                      Grenier Malick
                    </span>
                    <span
                      style={{
                        fontFamily: "'Instrument Serif',serif",
                        fontSize: '26px',
                        color: 'rgba(246,238,230,.85)',
                        lineHeight: '1',
                      }}
                    >
                      6
                    </span>
                  </div>
                  <div
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '7px' }}
                  >
                    {' '}
                    {awaleTop.map((p, k5) => (
                      <Fragment key={k5}>
                        <div
                          style={{
                            aspectRatio: '1',
                            boxSizing: 'border-box',
                            borderRadius: '50%',
                            background: '#2A1430',
                            border: '1px solid rgba(246,238,230,.14)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '14px',
                            fontWeight: '700',
                            color: 'rgba(246,238,230,.82)',
                          }}
                        >
                          {p.seeds}
                        </div>
                      </Fragment>
                    ))}
                  </div>
                  <div
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '7px' }}
                  >
                    {' '}
                    {awaleBottom.map((p, k6) => (
                      <Fragment key={k6}>
                        <div
                          style={{
                            aspectRatio: '1',
                            boxSizing: 'border-box',
                            borderRadius: '50%',
                            background: '#E8B860',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '14px',
                            fontWeight: '700',
                            color: '#170D1B',
                          }}
                        >
                          {p.seeds}
                        </div>
                      </Fragment>
                    ))}
                  </div>
                  <div
                    style={{
                      flex: '1',
                      borderRadius: '4px',
                      background: 'rgba(232,184,96,.16)',
                      border: '1px solid rgba(232,184,96,.4)',
                      padding: '0 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    {' '}
                    <span
                      style={{
                        fontSize: '11px',
                        letterSpacing: '.14em',
                        textTransform: 'uppercase',
                        color: '#E8B860',
                      }}
                    >
                      Grenier Aïssatou
                    </span>
                    <span
                      style={{
                        fontFamily: "'Instrument Serif',serif",
                        fontSize: '26px',
                        color: '#E8B860',
                        lineHeight: '1',
                      }}
                    >
                      8
                    </span>
                  </div>
                </div>
                <div>
                  {' '}
                  <h3 style={{ fontSize: '22px', fontWeight: '600', margin: '0 0 10px' }}>Awalé</h3>
                  <p
                    style={{
                      fontSize: '15px',
                      lineHeight: '1.55',
                      color: 'rgba(246,238,230,.7)',
                      margin: '0 0 16px',
                    }}
                  >
                    Douze cases, quarante-huit graines. Le plus vieux des quatre, et le plus rapide
                    à apprendre.
                  </p>
                  <div
                    style={{
                      fontSize: '13px',
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                      color: '#E8B860',
                    }}
                  >
                    {salonAcces}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section
          id="temoignages"
          style={{
            position: 'relative',
            zIndex: '3',
            maxWidth: '1440px',
            margin: '0 auto',
            padding: 'clamp(64px,8vw,120px) clamp(20px,5vw,72px)',
          }}
        >
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
            Ce qu'on nous dit
          </div>
          <h2
            style={{
              fontFamily: "'Instrument Serif',serif",
              fontWeight: '400',
              fontSize: 'clamp(34px,4.4vw,60px)',
              lineHeight: '1.05',
              margin: '0 0 clamp(34px,4vw,56px)',
              maxWidth: '16em',
            }}
          >
            Trois couples, trois soirées, trois conversations qui n'auraient pas eu lieu
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px, 100%),1fr))',
              gap: '20px',
            }}
          >
            {' '}
            {testimonials.map((t, k7) => (
              <Fragment key={k7}>
                <div
                  style={{
                    background: '#221029',
                    border: '1px solid rgba(246,238,230,.08)',
                    borderRadius: '6px',
                    padding: 'clamp(28px,3vw,36px)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '24px',
                  }}
                  className="cf-h3"
                >
                  {' '}
                  <div
                    style={{
                      fontFamily: "'Instrument Serif',serif",
                      fontSize: 'clamp(21px,2vw,25px)',
                      lineHeight: '1.35',
                      textWrap: 'pretty',
                    }}
                  >
                    {t.quote}
                  </div>
                  <div
                    style={{
                      marginTop: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                    }}
                  >
                    {' '}
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        background: t.avatar,
                        flexShrink: '0',
                      }}
                    ></div>
                    <div>
                      {' '}
                      <div style={{ fontSize: '15px', fontWeight: '600' }}>{t.names}</div>
                      <div style={{ fontSize: '14px', color: 'rgba(246,238,230,.68)' }}>
                        {t.city}
                      </div>
                    </div>
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        </section>
        <section
          id="regles"
          style={{
            position: 'relative',
            zIndex: '3',
            maxWidth: '1440px',
            margin: '0 auto',
            padding: 'clamp(64px,8vw,120px) clamp(20px,5vw,72px)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px, 100%),1fr))',
            gap: 'clamp(36px,5vw,72px)',
            alignItems: 'start',
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
              Nos règles
            </div>
            <h2
              style={{
                fontFamily: "'Instrument Serif',serif",
                fontWeight: '400',
                fontSize: 'clamp(34px,4.4vw,60px)',
                lineHeight: '1.05',
                margin: '0 0 20px',
              }}
            >
              C'est un jeu.
              <br />
              Pas un tribunal.
            </h2>
            <p
              style={{
                fontSize: '17px',
                lineHeight: '1.6',
                color: 'rgba(246,238,230,.66)',
                maxWidth: '30em',
                margin: '0',
              }}
            >
              Ce que vous lisez à la fin, ce sont des réponses à des situations imaginaires — pas un
              verdict sur votre couple. Tout est écrit pour que la partie finisse par une
              discussion, autour d'un verre, et pas par une dispute.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {' '}
            {rules.map((rule, k8) => (
              <Fragment key={k8}>
                <div
                  style={{
                    display: 'flex',
                    gap: '18px',
                    padding: '22px 0',
                    borderTop: '1px solid rgba(246,238,230,.14)',
                  }}
                >
                  {' '}
                  <div
                    style={{
                      fontSize: '14px',
                      color: '#E8B860',
                      fontVariantNumeric: 'tabular-nums',
                      paddingTop: '3px',
                    }}
                  >
                    {rule.num}
                  </div>
                  <div>
                    {' '}
                    <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '6px' }}>
                      {rule.title}
                    </div>
                    <div
                      style={{
                        fontSize: '15px',
                        lineHeight: '1.55',
                        color: 'rgba(246,238,230,.7)',
                      }}
                    >
                      {rule.body}
                    </div>
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        </section>
        <section
          id="pour-qui"
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
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px, 100%),1fr))',
              gap: '20px',
            }}
          >
            {' '}
            <div
              style={{
                borderRadius: '6px',
                background: '#33192F',
                border: '1px solid rgba(232,184,96,.28)',
                padding: 'clamp(30px,3.4vw,44px)',
              }}
            >
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
                C'est pour vous si
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {' '}
                <div style={{ fontSize: '17px', lineHeight: '1.5' }}>
                  Vous êtes ensemble depuis assez longtemps pour avoir des sujets que vous évitez.
                </div>
                <div style={{ fontSize: '17px', lineHeight: '1.5' }}>
                  Vous cherchez une soirée à deux qui ne soit ni un film ni un restaurant.
                </div>
                <div style={{ fontSize: '17px', lineHeight: '1.5' }}>
                  Vous préférez rire d'une question gênante que la laisser traîner.
                </div>
                <div style={{ fontSize: '17px', lineHeight: '1.5' }}>
                  Vous êtes loin l'un de l'autre et vous voulez autre chose qu'un appel.
                </div>
              </div>
            </div>
            <div
              style={{
                borderRadius: '6px',
                border: '1px solid rgba(246,238,230,.12)',
                padding: 'clamp(30px,3.4vw,44px)',
              }}
            >
              {' '}
              <div
                style={{
                  fontSize: '13px',
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  color: 'rgba(246,238,230,.7)',
                  marginBottom: '18px',
                }}
              >
                Ce n'est pas pour vous si
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  color: 'rgba(246,238,230,.78)',
                }}
              >
                {' '}
                <div style={{ fontSize: '17px', lineHeight: '1.5' }}>
                  Vous cherchez une preuve. Cœur Fidèle ne prouve rien et ne détecte rien.
                </div>
                <div style={{ fontSize: '17px', lineHeight: '1.5' }}>
                  Vous voulez confronter l'autre. Le jeu refuse de désigner un coupable.
                </div>
                <div style={{ fontSize: '17px', lineHeight: '1.5' }}>
                  Vous traversez une crise ouverte. Un professionnel sera plus utile qu'une partie.
                </div>
                <div style={{ fontSize: '17px', lineHeight: '1.5' }}>
                  Vous voulez jouer sans que l'autre le sache. Les deux consentements sont requis.
                </div>
              </div>
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
              Essayez d'abord.
              <br />
              Payez si vous revenez.
            </h2>
            <div style={{ fontSize: '15px', color: 'rgba(246,238,230,.66)' }}>
              Prix affichés pour la zone {zoneLabel}
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(290px, 100%),1fr))',
              gap: '20px',
              alignItems: 'stretch',
            }}
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
                    Le plus choisi
                  </div>
                )}
                <div
                  style={{
                    fontSize: '13px',
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: card.misEnAvant ? '#E8B860' : 'rgba(246,238,230,.64)',
                  }}
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
                >
                  {card.prix}
                </div>
                <div
                  style={{
                    fontSize: '15px',
                    color: 'rgba(246,238,230,.66)',
                    marginBottom: '24px',
                  }}
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
                >
                  {card.details.map((ligne) => (
                    <div key={ligne}>{ligne}</div>
                  ))}
                </div>
                <a
                  href={card.gratuit ? PLAY_HREF : '#inscription'}
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
                  className={card.misEnAvant ? 'cf-h2' : 'cf-h5'}
                >
                  {card.ctaLabel}
                </a>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '22px', fontSize: '15px', color: 'rgba(246,238,230,.64)' }}>
            {/* La phrase du canevas — « les points ne sont jamais débités » —
                décrivait une monnaie inexistante, et présentait les cinq moyens
                de paiement comme disponibles. /tarifs dit déjà l'inverse ; deux
                pages du même site ne peuvent pas répondre différemment à
                « puis-je payer aujourd'hui ? ». */}
            Wave, Orange Money, MTN MoMo, Moov et carte bancaire arrivent. Rien n'est débitable
            aujourd'hui, et nous préférons le dire.
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
                Ce qu'on nous demande avant de commencer
              </h2>
            </div>
            <a
              href="#"
              style={{
                padding: '15px 26px',
                borderRadius: '4px',
                border: '1px solid rgba(246,238,230,.26)',
                color: '#F6EEE6',
                fontWeight: '500',
                fontSize: '16px',
                whiteSpace: 'nowrap',
              }}
              className="cf-h5"
            >
              Poser la vôtre sur WhatsApp
            </a>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(330px, 100%),1fr))',
              gap: '16px',
            }}
          >
            {' '}
            {faq.map((item, k9) => (
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
                    {item.num}
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
                Votre prochain rendez-vous commence par un lien WhatsApp.
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
                Créez votre Espace Couple, envoyez l'invitation, jouez ce soir. Inscription par
                email, avec un code de vérification à 8 caractères.
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '26px' }}>
              {' '}
              <a href="#" style={{ color: 'inherit' }}>
                Confidentialité
              </a>
              <a href="#" style={{ color: 'inherit' }}>
                CGU
              </a>
              <a href="#" style={{ color: 'inherit' }}>
                Support WhatsApp
              </a>
              <a href="#" style={{ color: 'inherit' }}>
                English
              </a>
            </div>
            <div>Vos réponses sont chiffrées et ne sont jamais revendues.</div>
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
