// Cœur Fidèle, page d'accueil marketing.
//
// Mise en page et animations : canevas Claude Design « Cœur Fidèle, Landing »
// du 16/10/2026 (téléphones animés, trois manches, jeu à distance, rituel et
// Salon). Le propriétaire du produit a choisi « mise en page neuve, textes
// nettoyés » : la structure et le mouvement viennent du canevas, les mots et
// les chiffres restent ceux que le code peut tenir. Ce canevas remplace le
// précédent (artifact WqhHkSCUi1yHGRbycXNEAG) et la page courte du
// 14/10/2026 ; l'un et l'autre sont dans l'historique git.
//
// ── Ce qui vient du canevas, et ce qui n'en vient pas ──────────────────
//
// Du canevas : les sections, leurs styles (portés dans `app/landing.css`,
// préfixés et confinés à `.cf-landing`), les téléphones et leurs animations
// (`components/landing/Maquettes.tsx`, `CompteurScore.tsx`).
//
// Pas du canevas, parce qu'un canevas ne sait pas ce que fait le produit :
//   · LES CARTES DE TARIF (nom, prix, durée, lignes) viennent de
//     `lib/game/packs.ts` via `pricingCards`. Le canevas les recopiait à la
//     main, ce qui a déjà fait vendre une semaine sous le nom d'un mois
//     (`tarifs-derives.test.ts`), et décorait le Mois d'un ruban de
//     popularité que rien ne mesure : il porte « Recommandé », comme /tarifs.
//   · LES COMPTEURS sont lus : la banque de questions, le registre des
//     thèmes, le format conseillé (`lib/game/formats.ts`) pour le nombre de
//     questions et les minutes. Le canevas écrivait ses chiffres en dur.
//   · LES MOYENS DE PAIEMENT viennent de `MOYENS_DE_PAIEMENT` ; le canevas
//     oubliait la carte bancaire, que PayTech accepte.
//   · LE SALON : son accès vient de `salonAcces`, ses jeux du registre du
//     Salon (`lib/salon/jeux.ts`, `noms.ts`). Jamais « gratuit ».
//   · LES TEXTES gardent le nettoyage du 16/10/2026 (`sans-traces.test.ts`) :
//     aucun lien « # », aucun chiffre sans source, aucun tiret cadratin. Le
//     canevas proposait un autre titre, et un pied de page de liens
//     Confidentialité / CGU / Support qui ne menaient nulle part.
//   · LE JEU À DISTANCE se joue TOUR À TOUR (`lib/distance/`) : le canevas
//     annonçait la partie « en direct », à « des milliers de kilomètres ».
//     Voir `categories.test.ts`, qui tient les deux bouts de cette promesse.
//   · LA BANDE-ANNONCE (section `#film`) n'est pas dans le canevas. Le film
//     publicitaire de 20 s y vivait depuis le 14/10/2026 ; la bande-annonce
//     verticale de 42 s l'a remplacé le 17/10/2026, dans un cadre de
//     téléphone. Elle garde sa place entre le jeu et le jeu à distance, vit
//     dans `components/landing/FilmPub.tsx` et ne démarre que selon
//     `lib/landing/film.ts` : 5,5 Mo payés en données mobiles ne se
//     dépensent pas à l'ouverture de la page.
//   · LA CARTE D'INSCRIPTION par email du héros est partie avec l'ancienne
//     mise en page : le canevas mène à `/inscription` par un bouton, et le
//     formulaire de cette page-là fait le reste.
//
// Les téléphones restent une MAQUETTE : un couple fictif, des questions
// écrites pour l'illustration. Ce qu'ils disent du produit (nom des manches,
// écran de fin, attente à distance) vient du code, voir l'en-tête de
// `Maquettes.tsx`. Sur ce point, ne pas lire le reste de cette page comme la
// capture d'une vraie partie.
//
// `app/page.tsx` est exempté des deux tripwires de design
// (`one-button-design.test.ts`, `one-layout-root.test.ts`) : la landing a
// droit à sa propre mise en page et à son propre traitement de CTA.
import { Fraunces, Manrope } from 'next/font/google';
import './landing.css';
import { buildLandingDesignData, TOTAL_QUESTIONS } from '@/lib/landing/design-data';
import { cheminAchat } from '@/lib/game/pack-choisi';
import { MOYENS_DE_PAIEMENT } from '@/lib/game/achat';
import { DEFAULT_FORMAT_ID, formatById, type GameFormat } from '@/lib/game/formats';
import { roundLabelForType, type RoundType } from '@/lib/game/round-labels';
import { NOMS_THEMES } from '@/lib/game/themes';
import { JEUX } from '@/lib/salon/jeux';
import { NOMS_DES_JEUX } from '@/lib/salon/noms';
import { FilmPub } from '@/components/landing/FilmPub';
import {
  Coche,
  ICONES_DU_SALON,
  TelephoneFaceAFace,
  TelephoneFin,
  TelephoneMiroir,
  TelephoneQuestion,
  TelephoneRituel,
  TelephonesADistance,
  TelephoneScenario,
} from '@/components/landing/Maquettes';
import { Marque } from '@/components/ui/Marque';
import { donneesStructureesAccueil, scriptJsonLd } from '@/lib/seo/donnees-structurees';
import { PAGES_DE_CONTENU } from '@/lib/seo/contenus';

export const runtime = 'nodejs';

// Les deux polices du canevas, chargées pour cette seule page : le reste de
// l'app garde Instrument Serif et Familjen Grotesk (`app/layout.tsx`).
// Variables, donc un fichier par style quelle que soit la graisse, et servies
// depuis le domaine par `next/font` : aucune requête vers Google.
const fraunces = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

// Les destinations réelles. La maquette d'origine n'avait que des ancres et
// des « # » : reproduite telle quelle, la page d'accueil ne laissait plus
// aucun moyen de s'inscrire, de se connecter ou d'atteindre le jeu en
// cliquant (`lib/game/navigation-reachable.test.ts`).
const SIGN_IN_HREF = '/connexion';
const SIGN_UP_HREF = '/inscription';
const PLAY_HREF = '/jeu';

/** Le format que la page décrit : celui que `/jeu/nouvelle` propose d'abord. */
function formatConseille(): GameFormat {
  const format = formatById(DEFAULT_FORMAT_ID);
  if (!format) throw new Error(`Format par défaut introuvable : ${DEFAULT_FORMAT_ID}`);
  return format;
}

/** La règle d'une manche, telle que l'annoncent les écrans du jeu. */
function regleDeManche(type: RoundType): { titre: string; regle: string } {
  const label = roundLabelForType(type);
  if (!label) throw new Error(`Manche sans libellé : ${type}`);
  return { titre: label.title, regle: label.rule };
}

/**
 * « 4 900 FCFA » → « 4 900 », pour l'écrire en grand et laisser la devise
 * rejoindre la durée, comme le canevas. `null` quand le prix n'est pas un
 * montant (« Gratuit ») : la carte l'affiche alors tel quel.
 *
 * L'espace fine insécable du registre (U+202F) devient une insécable
 * ordinaire : Fraunces n'a pas de glyphe pour la fine, et le grand chiffre
 * s'affichait « 4900 », collé. L'insécable garde le montant sur une ligne.
 */
function montantSansDevise(prix: string, devise: string): string | null {
  const suffixe = ` ${devise}`;
  if (!prix.endsWith(suffixe)) return null;
  return prix.slice(0, -suffixe.length).replace(/\u202f/g, '\u00a0');
}

export default function Home() {
  const { ctaLabel, faq, pricingCards, salonAcces, zoneLabel } = buildLandingDesignData();
  const partie = formatConseille();
  const total = partie.totalQuestions;

  // Quatre questions sur six : celles qu'on se pose AVANT de payer (un
  // téléphone suffit-il, l'autre voit-il mes réponses, comment payer, combien
  // de temps dure un pack). Choisies par leur numéro dans `design-data`.
  const faqEssentielle = faq.filter((f) => ['01', '02', '04', '05'].includes(f.num));

  const manches = [
    { type: 'MIROIR', telephone: <TelephoneMiroir total={total} /> },
    { type: 'SCENARIO', telephone: <TelephoneScenario total={total} /> },
    { type: 'FACEAFACE', telephone: <TelephoneFaceAFace total={total} /> },
  ] as const;

  return (
    <>
      {/* Données structurées : la marque, le site, les offres du registre des
          packs et la FAQ affichée plus bas, voir lib/seo/donnees-structurees.ts. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: scriptJsonLd(donneesStructureesAccueil(faqEssentielle)),
        }}
      />
      <div className={`cf-landing cf-anime ${fraunces.variable} ${manrope.variable}`}>
        <header className="cf-conteneur cf-entete">
          <a href="#top" className="cf-logo">
            <Marque taille={30} />
            <span className="cf-serif" style={{ fontSize: 22, fontWeight: 600 }}>
              Cœur Fidèle
            </span>
          </a>
          <nav aria-label="Navigation principale" className="cf-nav">
            <a href="#manches">Le jeu</a>
            <a href="#film">Bande-annonce</a>
            <a href="#distance">À distance</a>
            <a href="#prix">Tarifs</a>
            <a href="#faq">FAQ</a>
            <a href={SIGN_IN_HREF} className="cf-nav-connexion">
              Se connecter
            </a>
          </nav>
          <a
            href={SIGN_UP_HREF}
            className="cf-bouton cf-bouton-or"
            style={{ padding: '12px 20px', fontSize: 15, whiteSpace: 'nowrap' }}
          >
            S’inscrire
          </a>
        </header>

        <section id="top" className="cf-conteneur cf-heros">
          <div className="cf-heros-texte">
            <span
              className="cf-pastille"
              style={{
                alignSelf: 'flex-start',
                background: 'rgba(233,184,92,.14)',
                color: 'var(--cf-or-clair)',
              }}
            >
              Côte à côte ou à distance · {partie.minutes} minutes
            </span>
            <h1>
              Le jeu de couple qui fait parler <em>de fidélité.</em>
            </h1>
            <p className="cf-texte" style={{ fontSize: 18, maxWidth: 520 }}>
              Cœur Fidèle est un jeu de couple en {total} questions, réparties en trois manches,
              avec un score commun. Vous jouez sur un téléphone que vous vous passez, ou chacun sur
              le sien si vous êtes loin l’un de l’autre.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <a
                href={SIGN_UP_HREF}
                className="cf-bouton cf-bouton-or"
                style={{ fontSize: 17, padding: '18px 28px' }}
              >
                {ctaLabel}
              </a>
              <a
                href="#manches"
                className="cf-bouton cf-bouton-contour"
                style={{ fontSize: 16, fontWeight: 600, padding: '18px 22px' }}
              >
                Voir une partie
              </a>
            </div>
            <div className="cf-coches">
              <span>
                <Coche />
                Première partie gratuite
              </span>
              <span>
                <Coche />
                Paiement Mobile Money
              </span>
              <span>
                <Coche />
                Sans carte bancaire
              </span>
            </div>
          </div>
          <div className="cf-heros-telephones">
            <div className="cf-halo" aria-hidden="true" />
            <TelephoneQuestion total={total} />
            <TelephoneFin total={total} />
          </div>
        </section>

        <section
          aria-label="En chiffres"
          style={{
            borderTop: '1px solid var(--cf-trait)',
            borderBottom: '1px solid var(--cf-trait)',
          }}
        >
          <div className="cf-conteneur cf-chiffres">
            <div className="cf-chiffre">
              <span>{TOTAL_QUESTIONS}</span>
              <span>questions dans le jeu</span>
            </div>
            <div className="cf-chiffre">
              <span>{NOMS_THEMES.length}</span>
              <span>thèmes au choix</span>
            </div>
            <div className="cf-chiffre">
              <span>{partie.minutes}</span>
              <span>minutes par partie, environ</span>
            </div>
            <div className="cf-chiffre">
              <span>1</span>
              <span>score commun pour le couple</span>
            </div>
          </div>
        </section>

        <section
          id="manches"
          className="cf-conteneur cf-section"
          style={{ display: 'flex', flexDirection: 'column', gap: 48 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
            <span className="cf-surtitre">Le jeu</span>
            <h2 className="cf-titre">Trois manches, un score commun.</h2>
            <p className="cf-texte">
              Vous ne jouez pas l’un contre l’autre. Deux manches pour vous découvrir, une pour
              tomber d’accord : chaque réponse commune du Face à face s’ajoute au score de votre
              couple.
            </p>
          </div>
          <div className="cf-manches">
            {manches.map(({ type, telephone }, index) => {
              const { titre, regle } = regleDeManche(type);
              return (
                <div key={type} className="cf-manche">
                  {telephone}
                  <div className="cf-manche-legende">
                    <h3>
                      {index + 1} · {titre}
                    </h3>
                    <p className="cf-texte-discret">{regle}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section
          id="film"
          className="cf-conteneur"
          style={{ paddingBottom: 'clamp(64px, 9vw, 96px)' }}
        >
          <div className="cf-film">
            <div className="cf-film-texte">
              <span className="cf-surtitre">La bande-annonce · 42 secondes</span>
              <h2 className="cf-titre">Une partie, du premier message au score commun.</h2>
              <p className="cf-texte">
                Le message de minuit, les trois manches, le jeu à distance et l’écran de fin.
              </p>
              <p className="cf-texte-discret">La vidéo est muette : tout est écrit à l’écran.</p>
              <a
                href={SIGN_UP_HREF}
                className="cf-bouton cf-bouton-or"
                style={{ alignSelf: 'flex-start', fontSize: 16, padding: '16px 26px' }}
              >
                {ctaLabel}
              </a>
            </div>
            <div className="cf-tel cf-tel-film cf-retard-2">
              <FilmPub />
            </div>
          </div>
        </section>

        <section id="distance" className="cf-bande">
          <div className="cf-conteneur cf-section cf-distance">
            <div className="cf-distance-telephones">
              <TelephonesADistance total={total} />
            </div>
            <div
              style={{
                flex: '1 1 380px',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <span className="cf-surtitre">À distance</span>
              <h2 className="cf-titre">Chacun sur son téléphone, même loin l’un de l’autre.</h2>
              <p className="cf-texte">
                Activez « Chacun sur son téléphone » sur vos deux téléphones : vous répondez tour à
                tour, et l’écran de celui qui attend suit la partie.
              </p>
              <p className="cf-texte-discret">
                Ensemble à la maison ? Un seul téléphone suffit : vous vous le passez, et l’écran se
                masque à chaque tour.
              </p>
            </div>
          </div>
        </section>

        <section className="cf-conteneur cf-section cf-duo">
          <div
            className="cf-duo-carte"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center' }}
          >
            <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span className="cf-surtitre">Le rituel</span>
              <h3 className="cf-titre-carte">Une question par jour.</h3>
              <p className="cf-texte-discret">
                Deux réponses, une minute. Votre flamme grandit chaque jour où vous répondez tous
                les deux.
              </p>
            </div>
            <TelephoneRituel />
          </div>
          <div
            className="cf-duo-carte"
            style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
          >
            <span className="cf-surtitre">Le Salon</span>
            <h3 className="cf-titre-carte">{JEUX.length} jeux pour les soirs légers.</h3>
            <p className="cf-texte-discret">
              Sur le même téléphone, quand vous voulez juste jouer. {salonAcces}.
            </p>
            <div className="cf-salon">
              {JEUX.map((jeu) => (
                <div key={jeu}>
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--cf-or)"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    {ICONES_DU_SALON[jeu]}
                  </svg>
                  <span>{NOMS_DES_JEUX[jeu]}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="prix" className="cf-bande">
          <div
            className="cf-conteneur cf-section"
            style={{ display: 'flex', flexDirection: 'column', gap: 40 }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                textAlign: 'center',
                alignItems: 'center',
              }}
            >
              <span className="cf-surtitre">Tarifs · zone {zoneLabel}</span>
              <h2 className="cf-titre">
                La première partie est offerte.
                <br />
                Ensuite, choisissez un pack.
              </h2>
              <p className="cf-texte-discret" style={{ fontSize: 16 }}>
                Un pack pris par l’un de vous deux vaut pour le couple. Aucun renouvellement
                automatique.
              </p>
            </div>
            <div className="cf-tarifs">
              {/* Une seule carte, répétée, et tout vient de `pricingCards` : les
                  cartes écrites à la main sont celles qui ont dérivé du registre. */}
              {pricingCards.map((card) => {
                const montant = montantSansDevise(card.prix, zoneLabel);
                return (
                  <div
                    key={card.id}
                    className={card.misEnAvant ? 'cf-tarif cf-tarif-vedette' : 'cf-tarif'}
                  >
                    {card.misEnAvant && (
                      <span className="cf-pastille cf-tarif-ruban">Recommandé</span>
                    )}
                    <span className="cf-tarif-nom">{card.nom}</span>
                    <span className="cf-tarif-prix">{montant ?? card.prix}</span>
                    <span className="cf-tarif-mention">
                      {montant ? `${zoneLabel} · ${card.mention}` : card.mention}
                    </span>
                    <ul className="cf-tarif-details">
                      {card.details.map((ligne) => (
                        <li key={ligne}>{ligne}</li>
                      ))}
                    </ul>
                    <a
                      href={card.gratuit ? PLAY_HREF : cheminAchat(card.id)}
                      className={`cf-bouton cf-tarif-cta ${
                        card.misEnAvant ? 'cf-bouton-or' : 'cf-bouton-contour'
                      }`}
                    >
                      {card.ctaLabel}
                    </a>
                  </div>
                );
              })}
            </div>
            <p className="cf-texte-discret" style={{ textAlign: 'center', fontSize: 14 }}>
              {/* Ne nommer ici que les moyens que PayTech propose réellement. */}
              Paiement sécurisé par PayTech : {MOYENS_DE_PAIEMENT}. Le pack s’ouvre dès que le
              paiement est confirmé.
            </p>
          </div>
        </section>

        <section id="faq" className="cf-conteneur cf-section" style={{ maxWidth: 900 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
            <span className="cf-surtitre">Questions fréquentes</span>
            <h2 className="cf-titre">Avant de commencer</h2>
          </div>
          <div className="cf-faq">
            {faqEssentielle.map((item) => (
              <details key={item.num}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="cf-conteneur" style={{ marginBottom: 64 }}>
          <div className="cf-appel">
            <div
              style={{
                flex: '1 1 420px',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <h2 className="cf-titre" style={{ fontSize: 'clamp(1.9rem, 3.6vw, 2.8rem)' }}>
                Prêts pour votre première partie ?
              </h2>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: '#4a2a40' }}>
                Créez votre Espace Couple, puis envoyez l’invitation à votre partenaire.
                L’inscription se fait par email, avec un code de vérification à 8 caractères.
              </p>
            </div>
            <div
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
            >
              <a
                href={SIGN_UP_HREF}
                className="cf-bouton cf-bouton-encre"
                style={{ fontSize: 17, padding: '18px 28px' }}
              >
                {ctaLabel}
              </a>
              <span style={{ fontSize: 13, color: '#4a2a40' }}>Réservé aux 18 ans et plus</span>
            </div>
          </div>
        </section>

        <footer style={{ borderTop: '1px solid var(--cf-trait)' }}>
          <div className="cf-conteneur cf-pied">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Marque taille={22} />
              <span
                className="cf-serif"
                style={{ fontSize: 18, fontWeight: 600, color: 'var(--cf-texte)' }}
              >
                Cœur Fidèle
              </span>
            </div>
            {/* Les pages de contenu, liées d'ici pour que les moteurs les
                trouvent autrement que par le sitemap, voir lib/seo/contenus.ts. */}
            <nav
              aria-label="À découvrir"
              style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', alignItems: 'baseline' }}
            >
              <span
                style={{
                  fontSize: 11,
                  letterSpacing: '.16em',
                  textTransform: 'uppercase',
                  color: 'rgba(244,232,226,.5)',
                }}
              >
                À découvrir
              </span>
              {PAGES_DE_CONTENU.map((page) => (
                <a key={page.chemin} href={page.chemin}>
                  {page.lien}
                </a>
              ))}
            </nav>
            <div>Vos réponses ne sont jamais revendues.</div>
          </div>
        </footer>
      </div>
    </>
  );
}
