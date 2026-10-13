// Données de la landing, transcrites depuis le canevas Claude Design
// « Cœur Fidèle — le jeu de couple sur la fidélité ».
//
// Le canevas portait sa logique dans une classe `DCLogic.renderVals()` ; ce
// module en est la traduction. Presque tout y est reproduit à l'identique —
// plateaux, témoignages, FAQ, règles.
//
// DEUX EXCEPTIONS, et elles vont dans le même sens : les PRIX et les PALIERS
// D'ACCÈS ne sont plus transcrits, ils sont DÉRIVÉS de `lib/game/packs.ts`.
// Le canevas annonçait un abonnement à 25 000 F là où l'Intégral en coûte
// 9 900 par mois, et marquait deux thèmes gratuits là où un seul l'est. Un
// chiffre de maquette qui exagère un contenu est une licence marketing ; un
// PRIX faux est une promesse que la caisse ne tiendra pas, et une étiquette
// « Gratuit » sur un thème fermé envoie le visiteur droit sur un cadenas.
//
// Les COMPTEURS DE QUESTIONS ont suivi le même chemin : comptés dans
// `QUESTIONS_SEED` plutôt que recopiés du canevas, qui en annonçait 60 ou
// 50 par carte là où la banque en livre 30.
//
// Conséquence sur les frontières : ce module importe désormais la banque,
// donc il ne doit JAMAIS être atteignable depuis un composant client — les
// poids des options SCENARIO partiraient au navigateur. Un module tampon a
// tenu cette frontière tant que la carte d'inscription était cliente ; elle
// ne l'est plus, et `categories.test.ts` vérifie maintenant la règle sur
// TOUS les composants client du dépôt plutôt que sur un fichier nommé.
import {
  LIBELLE_DEVISE,
  PACKS_PAYANTS,
  PACKS_VISIBLES,
  packDecouverte,
  palierDuTheme,
} from '@/lib/game/packs';
import type { Pack } from '@/lib/game/packs';
import { NOMS_THEMES } from '@/lib/game/themes';
import { QUESTIONS_SEED } from '../../../prisma/seed-data/questions';

/**
 * Une carte de tarif, entièrement DÉRIVÉE du registre.
 *
 * Les PRIX l'étaient déjà. Les NOMS, les PÉRIODES et les compteurs de thèmes
 * ne l'étaient pas : ils restaient transcrits dans `app/page.tsx`, et le
 * 02/10/2026 ils ont dérivé. La production annonçait « Essentiel · 4 900 F ·
 * par mois · 6 thèmes sur 8 » quand le registre vendait « Semaine · 4 900 ·
 * 7 jours · les huit thèmes ». Quelqu'un qui payait 4 900 en croyant acheter
 * un mois recevait une semaine — c'est la même faute qu'un prix faux, et
 * c'est pourquoi la carte entière est dérivée désormais.
 */
export interface PricingCard {
  id: string;
  nom: string;
  /** « Gratuit », ou « 4 900 FCFA ». */
  prix: string;
  /** Sous le prix : « par semaine », « Une partie offerte par couple »… */
  mention: string;
  /** Les lignes de la carte, dans l'ordre. */
  details: readonly string[];
  /** La carte mise en avant porte le bandeau et le bouton plein. */
  misEnAvant: boolean;
  /** Le gratuit mène au jeu ; les payants mènent à l'inscription. */
  gratuit: boolean;
  ctaLabel: string;
}

/**
 * `4900` → `« 4 900 FCFA »`, avec une espace fine insécable.
 *
 * Groupé à la main plutôt que par `toLocaleString('fr-FR')` : le séparateur
 * que renvoie ICU varie selon la version de Node, et un prix qui se coupe en
 * fin de ligne entre le 4 et le 900 se lit comme deux nombres.
 */
function enFrancs(montant: number): string {
  return `${String(montant).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')} ${LIBELLE_DEVISE}`;
}

/**
 * Les lignes d'une carte, déduites du palier.
 *
 * Le compteur de thèmes est COMPARÉ au catalogue plutôt qu'écrit : « 6 thèmes
 * sur 8 » est resté affiché en production après que les trois paliers payants
 * ont été ouverts au catalogue entier.
 */
function detailsDuPack(pack: Pack): string[] {
  const gratuit = pack.prix === 0;
  const complet = pack.themes.length === NOMS_THEMES.length;
  const premier = pack.themes[0];
  return [
    gratuit ? 'Une partie offerte, pour essayer' : 'Parties illimitées',
    complet
      ? `Les ${NOMS_THEMES.length} thèmes, sans réserve`
      : pack.themes.length === 1 && premier
        ? `1 thème : ${premier}`
        : `${pack.themes.length} thèmes sur ${NOMS_THEMES.length}`,
    pack.salon ? 'Le Salon inclus, les cinq jeux' : 'Le Salon non inclus',
    gratuit ? 'Sur votre seul appareil, à deux' : 'Ouvert pour vous deux',
  ];
}

/**
 * Ce qu'il faut pour entrer au Salon, déduit du registre.
 *
 * La vitrine affichait « Gratuit » sur la carte Awalé. Le palier Découverte
 * porte `salon: false` : un compte gratuit qui clique est refusé par le
 * serveur (`SALON_LOCKED`). L'étiquette envoyait donc le visiteur droit sur un
 * cadenas — exactement ce que l'en-tête de ce module s'engage à ne plus faire.
 *
 * Le libellé nomme le palier le MOINS cher qui l'ouvre : si demain un pack
 * plus court inclut le Salon, la phrase suit sans être retouchée.
 */
const PACK_OUVRANT_LE_SALON = PACKS_VISIBLES.find((p) => p.salon && p.prix > 0);
const ACCES_AU_SALON = PACK_OUVRANT_LE_SALON
  ? `Inclus dès le pack ${PACK_OUVRANT_LE_SALON.nom}`
  : 'Inclus avec un pack';

// Une seule grille, en FCFA. Le canevas en portait trois — FCFA, Europe,
// Amérique du Nord — mais aucune n'était sélectionnable : `priceZone` n'était
// jamais passé, donc seules les valeurs FCFA s'affichaient. Les deux autres
// étaient des montants inventés que rien ne rendait, et les mettre à jour
// n'aurait fait que les rendre faux d'une nouvelle façon. Le produit ne vend
// qu'en XOF ; le jour où une seconde devise existe, elle se déclare dans
// `packs.ts` avec le reste.
//
// PACKS_VISIBLES et non PACKS : l'Annuel est retiré de la vente depuis le
// 02/10/2026 mais reste dans le registre pour que les droits déjà payés
// restent résolubles. L'accueil l'annonçait encore — « ou 118 800 F l'année »
// sous la carte Intégral — donc elle affichait un prix pour quelque chose qui
// n'était plus à vendre. Itérer sur PACKS le remettrait en vitrine.
const PRICING_CARDS: readonly PricingCard[] = PACKS_VISIBLES.map((pack) => {
  const gratuit = pack.prix === 0;
  return {
    id: pack.id,
    nom: pack.nom,
    prix: gratuit ? 'Gratuit' : enFrancs(pack.prix),
    mention: gratuit ? 'Une partie offerte par couple' : (pack.periode ?? ''),
    details: detailsDuPack(pack),
    // Le même palier est recommandé ici et sur /tarifs. Deux surfaces qui
    // mettent en avant deux packs différents se contredisent devant le client.
    misEnAvant: pack.id === 'INTEGRAL',
    gratuit,
    // Rien n'est débitable aujourd'hui et ces boutons mènent au formulaire
    // d'inscription, pas à une caisse. « Acheter le pack » et « S'abonner »
    // nommaient donc des actions qui n'existent pas — le mensonge d'interface
    // que /tarifs refuse explicitement en n'affichant aucun bouton d'achat.
    ctaLabel: gratuit ? 'Commencer' : 'Créer notre Espace Couple',
  };
});

export interface CategoryCell {
  name: string;
  access: string;
  count: number;
  tint: string;
}

/**
 * Le compteur de questions par thème — compté dans la banque livrée.
 *
 * Le canevas annonçait 60 ou 50 par carte ; la banque en livre 30. Un
 * chiffre gonflé sur une carte de thème promet un contenu qui ne vient
 * pas, et le visiteur s'en aperçoit à la première partie.
 *
 * Dérivé et non recopié : ajouter dix questions à un thème met la carte à
 * jour toute seule, et aucun compteur de cette page ne peut plus être faux.
 */
function compterParTheme(): Record<string, number> {
  const parTheme: Record<string, number> = {};
  for (const q of QUESTIONS_SEED) {
    parTheme[q.category] = (parTheme[q.category] ?? 0) + 1;
  }
  return parTheme;
}

const COMPTEURS = compterParTheme();

/** Le total affiché en tête de section — la banque entière, thèmes et fonds général. */
export const TOTAL_QUESTIONS = QUESTIONS_SEED.length;
/** La teinte de la pastille, par palier — reprise du canevas. */
const TEINTES_PAR_PALIER: Record<string, string> = {
  DECOUVERTE: '#8B2C56',
  ESSENTIEL: 'rgba(36,17,41,.68)',
  INTEGRAL: '#A9761F',
  ANNUEL: '#A9761F',
};

/**
 * La grille des thèmes, avec le palier qui ouvre chacun.
 *
 * `access` et `tint` viennent de `palierDuTheme()`, donc de `packs.ts` : la
 * même fonction que le sélecteur de thèmes utilise pour écrire « Verrouillé ·
 * Essentiel » sur une carte. Une carte d'accueil et une carte de jeu ne
 * peuvent plus se contredire sur le même thème.
 */
const ALL_CATEGORIES: CategoryCell[] = NOMS_THEMES.map((nom) => {
  const palier = palierDuTheme(nom) ?? packDecouverte();
  return {
    name: nom,
    access: palier.nom,
    count: COMPTEURS[nom] ?? 0,
    tint: TEINTES_PAR_PALIER[palier.id] ?? '#A9761F',
  };
});

export interface CheckerSquare {
  bg: string;
  piece: boolean;
  pieceBg: string;
  pieceRing: string;
}

const LIGHT_SQUARE = '#EFE3D6';
const DARK_SQUARE = '#3D2036';

function buildCheckersBoard(): CheckerSquare[] {
  const board: CheckerSquare[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const playable = (r + c) % 2 === 1;
      let piece = false;
      let pieceBg = '';
      let pieceRing = '';
      if (playable && r < 3) {
        piece = true;
        pieceBg = '#8B2C56';
        pieceRing = 'rgba(246,238,230,.55)';
      }
      if (playable && r > 4) {
        piece = true;
        pieceBg = '#F6EEE6';
        pieceRing = 'rgba(36,17,41,.4)';
      }
      if ((r === 2 && c === 3) || (r === 5 && c === 2) || (r === 6 && c === 5)) piece = false;
      if (r === 4 && c === 3) {
        piece = true;
        pieceBg = '#F6EEE6';
        pieceRing = '#8B2C56';
      }
      board.push({ bg: playable ? DARK_SQUARE : LIGHT_SQUARE, piece, pieceBg, pieceRing });
    }
  }
  return board;
}

export interface WordCell {
  letter: string;
  bg: string;
  fg: string;
}

interface PlacedWord {
  r: number;
  c: number;
  word: string;
  dir: 'h' | 'v';
  mine: boolean;
}

const PLACED_WORDS: PlacedWord[] = [
  { r: 4, c: 1, word: 'FIDELE', dir: 'h', mine: true },
  { r: 2, c: 6, word: 'COEUR', dir: 'v', mine: false },
  { r: 7, c: 2, word: 'NUIT', dir: 'h', mine: false },
];

function buildWordBoard(): WordCell[] {
  const grid: WordCell[] = Array.from({ length: 81 }, (_, i) => {
    const r = Math.floor(i / 9);
    const c = i % 9;
    const bonus = r === 4 && c === 4 ? '#8B2C56' : (r + c) % 7 === 0 ? '#33193A' : '#2A1430';
    return { letter: '', bg: bonus, fg: '#F6EEE6' };
  });
  for (const w of PLACED_WORDS) {
    for (let i = 0; i < w.word.length; i++) {
      const r = w.dir === 'h' ? w.r : w.r + i;
      const c = w.dir === 'h' ? w.c + i : w.c;
      grid[r * 9 + c] = {
        letter: w.word[i] ?? '',
        bg: w.mine ? '#E8B860' : '#F6EEE6',
        fg: '#241129',
      };
    }
  }
  return grid;
}

export interface Testimonial {
  quote: string;
  names: string;
  city: string;
  avatar: string;
}

export interface FaqItem {
  num: string;
  q: string;
  a: string;
}

export interface RuleItem {
  num: string;
  title: string;
  body: string;
}

export interface LandingDesignData {
  ctaLabel: string;
  otpCells: { caractere: string }[];
  categories: CategoryCell[];
  checkersBoard: CheckerSquare[];
  wordBoard: WordCell[];
  awaleTop: { seeds: number }[];
  awaleBottom: { seeds: number }[];
  testimonials: Testimonial[];
  faq: FaqItem[];
  rules: RuleItem[];
  zoneLabel: string;
  /** Les cartes de tarif, dans l'ordre du registre. */
  pricingCards: readonly PricingCard[];
  /** L'étiquette d'accès au Salon, sur la vitrine des jeux. */
  salonAcces: string;
}

export interface LandingDesignOptions {
  /** `false` masque les thèmes que le palier gratuit n'ouvre pas. Défaut `true`. */
  showLockedCategories?: boolean;
}

export function buildLandingDesignData(options: LandingDesignOptions = {}): LandingDesignData {
  const paid = options.showLockedCategories ?? true;
  // Le palier gratuit, pour filtrer les cartes quand `showLockedCategories`
  // est faux. Comparé par NOM de palier et non par la chaîne « Gratuit » :
  // ce mot ne figure plus dans le registre, et le filtre serait devenu
  // silencieusement vide.
  const nomDuGratuit = packDecouverte().nom;

  return {
    ctaLabel: 'Créer notre Espace Couple',
    // Le canevas montrait SIX chiffres. Le vrai code de vérification en
    // compte HUIT, tirés de l’alphabet Crockford `ABCDEFGHJKMNPQRSTUVWXYZ
    // 23456789` (voir `VERIFICATION_CODE_ALPHABET` dans `lib/server/auth.ts`,
    // qui ne l’exporte pas et qu’on ne peut donc pas importer ici — ce module
    // est atteint par la page d’accueil, et `auth.ts` jette au chargement si
    // `JWT_SECRET` manque). Ces huit-là sont décoratifs, mais ils pourraient
    // sortir du générateur : un visiteur ne verra plus une forme de code que
    // le produit n’enverra jamais.
    otpCells: ['K', '7', 'M', '3', 'R', '9', 'P', '4'].map((caractere) => ({ caractere })),
    categories: paid ? ALL_CATEGORIES : ALL_CATEGORIES.filter((c) => c.access === nomDuGratuit),
    checkersBoard: buildCheckersBoard(),
    wordBoard: buildWordBoard(),
    awaleTop: [4, 4, 0, 5, 4, 4].map((seeds) => ({ seeds })),
    awaleBottom: [4, 5, 5, 0, 4, 4].map((seeds) => ({ seeds })),
    testimonials: [
      {
        quote:
          '« On a passé quarante minutes sur une question de six secondes. C’était la bonne question. »',
        names: 'Aïssatou & Malick',
        city: 'Dakar',
        avatar: 'linear-gradient(140deg,#8B2C56,#E8B860)',
      },
      {
        quote:
          '« Je savais déjà ce qu’il allait répondre. Ce que je ne savais pas, c’est pourquoi. »',
        names: 'Grâce & Yannick',
        city: 'Abidjan',
        avatar: 'linear-gradient(140deg,#E8B860,#8B2C56)',
      },
      {
        quote: '« On joue à distance le dimanche soir. Ça remplace l’appel où on ne se dit rien. »',
        names: 'Fatou & Ibrahim',
        city: 'Montréal',
        avatar: 'linear-gradient(140deg,#3A1B33,#E8B860)',
      },
    ],
    faq: [
      {
        num: '01',
        q: 'Faut-il que l’autre ait un smartphone ?',
        a: 'Non, un seul suffit : le jeu se joue sur un téléphone que vous vous passez, et l’écran se masque à chaque tour. Si vous êtes loin l’un de l’autre, lancez l’appel vidéo : chacun joue alors sur le sien, tour à tour, en se voyant.',
      },
      {
        num: '02',
        q: 'Est-ce que mon partenaire voit mes réponses ?',
        a: 'Seulement à la fin de chaque manche, et uniquement les réponses de la manche en cours. Aucun historique individuel n’est consultable.',
      },
      {
        num: '03',
        q: 'Le score veut-il dire que je suis infidèle ?',
        a: 'Non. Il mesure des réponses à des situations imaginaires. Les mots « perdant » et « infidèle » n’apparaissent nulle part dans l’app.',
      },
      {
        num: '04',
        q: 'Comment payer sans carte bancaire ?',
        // Le « solde de points commun » de la maquette n'a jamais existé : un
        // pack est un droit d'accès, et celui d'un partenaire ouvre le jeu au
        // couple entier (`server/game/entitlements.ts`).
        a: 'Wave, Orange Money, MTN MoMo et Moov. Un pack pris par l’un de vous deux vaut pour le couple.',
      },
      {
        num: '05',
        // Remplace « Les points expirent-ils ? Jamais » : il n'y a pas de
        // points, et un pack, lui, expire. Les durées sont lues du registre.
        q: 'Combien de temps dure un pack ?',
        a: `${PACKS_PAYANTS.map((p) => `${p.nom} : ${p.dureeJours} jours`).join(', ')}. Un pack ne se renouvelle pas tout seul : vous ne payez que ce que vous choisissez.`,
      },
      {
        num: '06',
        // Remplace « Peut-on supprimer nos données ? Oui, depuis les
        // réglages » : aucun écran ne le permet. On ne promet pas un bouton
        // qui n'existe pas.
        q: 'Et les soirs où l’on n’a pas le temps ?',
        a: 'Le rituel du jour suffit : une question, deux réponses, une minute. Il entretient votre flamme et débloque vos badges, même sans partie complète.',
      },
    ],
    rules: [
      {
        num: '01',
        title: 'Jamais de « perdant »',
        body: 'Le second est Cœur Sincère. Les mots « perdant » et « infidèle » n’existent nulle part dans l’app.',
      },
      {
        num: '02',
        title: 'Le score du couple d’abord',
        body: 'Il s’affiche en grand, avant les scores individuels.',
      },
      {
        num: '03',
        title: 'Passer sans pénalité',
        body: 'Une question met mal à l’aise ? Le bouton passer ne coûte ni point ni score.',
      },
      {
        num: '04',
        title: 'Rien à partager contre l’autre',
        body: 'La carte de résultat n’affiche jamais le score de votre partenaire.',
      },
      {
        num: '05',
        title: 'Pas d’archives à ressortir',
        body: 'Aucun historique consultable des réponses individuelles. Seulement le rapport agrégé.',
      },
    ],
    zoneLabel: LIBELLE_DEVISE,
    pricingCards: PRICING_CARDS,
    salonAcces: ACCES_AU_SALON,
  };
}
