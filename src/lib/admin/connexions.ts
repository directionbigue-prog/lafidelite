// Ce que la console d'administration sait des connexions : avec quel type
// d'appareil, depuis quel pays, et à quel rythme.
//
// CE QUE CE MODULE NE GARDE PAS, ET C'EST VOLONTAIRE. L'adresse IP n'est
// jamais stockée, et la chaîne « user-agent » non plus. Seules deux valeurs
// dérivées le sont : une classe d'appareil parmi quatre, et un code pays sur
// deux lettres. L'IP est une donnée personnelle qui identifie un abonné ; le
// pays qu'on en déduit ne l'est pratiquement pas, et il répond exactement à la
// question posée. Garder l'IP « au cas où » serait un risque sans usage.
//
// Tout ici est PUR : aucun accès réseau, aucun Prisma, aucun `Date.now()`
// implicite. Les instants sont toujours passés en paramètre, sinon les tests
// de regroupement ne pourraient rien affirmer de stable.

/**
 * Les quatre classes d'appareil, dans l'ordre où la console les affiche.
 *
 * `AUTRE` n'est pas un échec : c'est un robot, un client exotique, ou un
 * navigateur qui ne dit rien. Le compter à part évite de gonfler
 * « ORDINATEUR », qui serait le fourre-tout naturel.
 */
export const TYPES_APPAREIL = ['TELEPHONE', 'TABLETTE', 'ORDINATEUR', 'AUTRE'] as const;

export type TypeAppareil = (typeof TYPES_APPAREIL)[number];

const LIBELLES_APPAREIL: Record<TypeAppareil, string> = {
  TELEPHONE: 'Téléphone',
  TABLETTE: 'Tablette',
  ORDINATEUR: 'Ordinateur',
  AUTRE: 'Autre',
};

export function libelleAppareil(type: string): string {
  return LIBELLES_APPAREIL[type as TypeAppareil] ?? type;
}

/**
 * Déduit la classe d'appareil d'un « user-agent ».
 *
 * L'ORDRE DES TESTS EST LA SEULE CHOSE SUBTILE ICI. Un iPad annonce
 * « iPad … Mobile/15E148 » : il contient le mot `Mobile`, donc chercher le
 * téléphone d'abord classerait toutes les tablettes Apple en téléphones. Les
 * tablettes Android ont le problème inverse — elles disent `Android` sans
 * `Mobile`, là où les téléphones Android disent les deux. On teste donc la
 * tablette en premier, et le téléphone ensuite.
 *
 * Volontairement sans dépendance. Une bibliothèque de détection pèse des
 * centaines de kilo-octets de table de correspondance pour distinguer des
 * modèles dont nous n'avons aucun usage : la question posée a quatre réponses.
 */
export function typeAppareil(userAgent: string | null | undefined): TypeAppareil {
  const ua = (userAgent ?? '').trim();
  if (!ua) return 'AUTRE';
  const u = ua.toLowerCase();

  // Les robots d'abord : beaucoup se présentent aussi comme un navigateur, et
  // les compter comme des visites fausserait tous les graphiques.
  if (/bot|crawler|spider|crawling|headlesschrome|lighthouse|preview|monitor/.test(u)) {
    return 'AUTRE';
  }

  // Tablette avant téléphone — voir le commentaire ci-dessus.
  if (/ipad|tablet|playbook|silk|kindle/.test(u)) return 'TABLETTE';
  if (/android/.test(u) && !/mobile/.test(u)) return 'TABLETTE';

  if (/iphone|ipod|android|windows phone|blackberry|bb10|opera mini|iemobile|mobile/.test(u)) {
    return 'TELEPHONE';
  }

  if (/windows nt|macintosh|mac os x|linux|cros|x11/.test(u)) return 'ORDINATEUR';

  return 'AUTRE';
}

/**
 * Valide un code pays ISO 3166-1 alpha-2, tel que Vercel le fournit.
 *
 * L'en-tête `x-vercel-ip-country` arrive de l'infrastructure, mais un en-tête
 * reste une entrée : en développement il est absent, et rien n'empêche un
 * client de l'inventer. On n'accepte donc que deux lettres, et on remonte en
 * majuscules. `XX` est ce que Vercel renvoie quand il ne sait pas — on le
 * traite comme une absence plutôt que comme un pays.
 */
export function paysValide(brut: string | null | undefined): string | null {
  const v = (brut ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(v)) return null;
  if (v === 'XX' || v === 'T1') return null; // inconnu, et réseau Tor
  return v;
}

/**
 * `SN` → 🇸🇳.
 *
 * Un drapeau Unicode est une paire d'« indicateurs régionaux » : la lettre A
 * vaut U+1F1E6, et le couple de lettres du pays se rend comme un seul glyphe.
 * Aucune image, aucun fichier à servir, et ça suit la police du système.
 */
export function drapeau(code: string | null | undefined): string {
  const pays = paysValide(code);
  if (!pays) return '🏳️';
  const base = 0x1f1e6;
  const a = base + (pays.charCodeAt(0) - 65);
  const b = base + (pays.charCodeAt(1) - 65);
  return String.fromCodePoint(a, b);
}

/**
 * Les pays que ce produit voit réellement, en français.
 *
 * Délibérément COURT : l'Afrique de l'Ouest, les destinations de la diaspora,
 * et c'est tout. Embarquer les 249 codes de la norme pèserait pour des pays
 * qu'aucune ligne de la base ne contient. Un code absent s'affiche tel quel,
 * à côté de son drapeau, ce qui reste lisible — et `Intl.DisplayNames` n'est
 * pas utilisé parce que son jeu de données varie selon la version de Node,
 * donc le même pays pourrait s'écrire autrement d'un déploiement à l'autre.
 */
const NOMS_PAYS: Record<string, string> = {
  SN: 'Sénégal',
  ML: 'Mali',
  CI: "Côte d'Ivoire",
  BF: 'Burkina Faso',
  GN: 'Guinée',
  GW: 'Guinée-Bissau',
  MR: 'Mauritanie',
  GM: 'Gambie',
  NE: 'Niger',
  TG: 'Togo',
  BJ: 'Bénin',
  CM: 'Cameroun',
  GA: 'Gabon',
  CD: 'Congo (RDC)',
  CG: 'Congo',
  MA: 'Maroc',
  DZ: 'Algérie',
  TN: 'Tunisie',
  NG: 'Nigéria',
  GH: 'Ghana',
  FR: 'France',
  BE: 'Belgique',
  CH: 'Suisse',
  ES: 'Espagne',
  IT: 'Italie',
  PT: 'Portugal',
  DE: 'Allemagne',
  GB: 'Royaume-Uni',
  US: 'États-Unis',
  CA: 'Canada',
  AE: 'Émirats arabes unis',
  SA: 'Arabie saoudite',
  QA: 'Qatar',
  TR: 'Turquie',
  CN: 'Chine',
  IN: 'Inde',
  BR: 'Brésil',
};

export function nomPays(code: string | null | undefined): string {
  const pays = paysValide(code);
  if (!pays) return 'Pays inconnu';
  return NOMS_PAYS[pays] ?? pays;
}

/** Les cinq échelles de temps que la console propose. */
export const GRANULARITES = ['heure', 'jour', 'semaine', 'mois', 'annee'] as const;

export type Granularite = (typeof GRANULARITES)[number];

export function estGranularite(v: string | null | undefined): v is Granularite {
  return typeof v === 'string' && (GRANULARITES as readonly string[]).includes(v);
}

/**
 * Combien de temps la console regarde en arrière, par échelle.
 *
 * Choisi pour que chaque vue tienne dans un graphique lisible : 24 points pour
 * les heures, 30 pour les jours, et ainsi de suite. Une fenêtre plus large ne
 * montrerait pas plus, elle tasserait les barres.
 */
export const POINTS_PAR_GRANULARITE: Record<Granularite, number> = {
  heure: 24,
  jour: 30,
  semaine: 12,
  mois: 12,
  annee: 5,
};

/**
 * Le début du seau contenant `date`, en UTC.
 *
 * UTC et non l'heure locale du serveur : une fonction serverless peut
 * s'exécuter dans n'importe quelle région, et deux requêtes identiques
 * tomberaient alors dans des seaux différents selon la machine qui répond.
 * Le prix est que « lundi » commence à minuit UTC, soit minuit à Dakar — ce
 * qui est précisément le bon fuseau pour ce produit.
 */
export function debutDuSeau(date: Date, granularite: Granularite): Date {
  const d = new Date(date.getTime());
  switch (granularite) {
    case 'heure':
      d.setUTCMinutes(0, 0, 0);
      return d;
    case 'jour':
      d.setUTCHours(0, 0, 0, 0);
      return d;
    case 'semaine': {
      d.setUTCHours(0, 0, 0, 0);
      // Semaine ISO : lundi. `getUTCDay()` rend 0 pour dimanche, qu'il faut
      // donc reculer de six jours et non d'aucun.
      const jour = d.getUTCDay();
      const recul = jour === 0 ? 6 : jour - 1;
      d.setUTCDate(d.getUTCDate() - recul);
      return d;
    }
    case 'mois':
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(1);
      return d;
    case 'annee':
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCMonth(0, 1);
      return d;
  }
}

/** Le seau suivant. Utilisé pour construire la série sans trou. */
export function seauSuivant(debut: Date, granularite: Granularite): Date {
  const d = new Date(debut.getTime());
  switch (granularite) {
    case 'heure':
      d.setUTCHours(d.getUTCHours() + 1);
      return d;
    case 'jour':
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
    case 'semaine':
      d.setUTCDate(d.getUTCDate() + 7);
      return d;
    case 'mois':
      d.setUTCMonth(d.getUTCMonth() + 1);
      return d;
    case 'annee':
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      return d;
  }
}

export interface PointSerie {
  /** Le début du seau, en ISO — la clé stable que le client peut comparer. */
  debut: string;
  /** Ce que l'écran affiche sous la barre. */
  libelle: string;
  nombre: number;
}

const MOIS_COURTS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

/**
 * L'étiquette sous une barre.
 *
 * Écrite à la main plutôt que par `toLocaleDateString('fr-FR')` : ICU varie
 * selon la version de Node et la plateforme, donc la même donnée s'étiquetait
 * autrement en local et en production — le même piège que le séparateur de
 * milliers des prix, déjà rencontré sur cette base.
 */
export function libelleDuSeau(debut: Date, granularite: Granularite): string {
  const j = debut.getUTCDate();
  const m = MOIS_COURTS[debut.getUTCMonth()] ?? '';
  const a = debut.getUTCFullYear();
  switch (granularite) {
    case 'heure':
      return `${String(debut.getUTCHours()).padStart(2, '0')}h`;
    case 'jour':
      return `${j} ${m}`;
    case 'semaine':
      return `sem. du ${j} ${m}`;
    case 'mois':
      return `${m} ${a}`;
    case 'annee':
      return String(a);
  }
}

/**
 * Construit la série complète, SEAUX VIDES COMPRIS.
 *
 * C'est le point de ce module. Une requête `GROUP BY` ne renvoie que les
 * périodes où il s'est passé quelque chose : un graphique construit dessus
 * place deux jours actifs côte à côte et masque la semaine de silence entre
 * eux, ce qui inverse la lecture. On génère donc tous les seaux de la fenêtre,
 * puis on y verse les comptes.
 *
 * @param maintenant l'instant de référence, toujours passé — jamais `new Date()`
 *                   pris à l'intérieur, sinon aucun test ne peut rien affirmer.
 */
export function construireSerie(
  lignes: readonly { debut: Date; nombre: number }[],
  granularite: Granularite,
  maintenant: Date,
): PointSerie[] {
  const points = POINTS_PAR_GRANULARITE[granularite];
  const comptes = new Map<number, number>();
  for (const l of lignes) {
    const cle = debutDuSeau(l.debut, granularite).getTime();
    comptes.set(cle, (comptes.get(cle) ?? 0) + l.nombre);
  }

  // On part du seau courant et on recule, puis on remet dans l'ordre : avancer
  // depuis une date de départ calculée demanderait de soustraire des mois, ce
  // qui ramène le problème des quantièmes impossibles déjà vu sur les packs.
  const seaux: Date[] = [];
  let curseur = debutDuSeau(maintenant, granularite);
  for (let i = 0; i < points; i++) {
    seaux.push(curseur);
    curseur = reculerDUnSeau(curseur, granularite);
  }
  seaux.reverse();

  return seaux.map((debut) => ({
    debut: debut.toISOString(),
    libelle: libelleDuSeau(debut, granularite),
    nombre: comptes.get(debut.getTime()) ?? 0,
  }));
}

function reculerDUnSeau(debut: Date, granularite: Granularite): Date {
  const d = new Date(debut.getTime());
  switch (granularite) {
    case 'heure':
      d.setUTCHours(d.getUTCHours() - 1);
      return d;
    case 'jour':
      d.setUTCDate(d.getUTCDate() - 1);
      return d;
    case 'semaine':
      d.setUTCDate(d.getUTCDate() - 7);
      return d;
    case 'mois':
      d.setUTCMonth(d.getUTCMonth() - 1);
      return d;
    case 'annee':
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      return d;
  }
}

/** Le début de la fenêtre interrogée, pour le `where` de la requête. */
export function debutDeFenetre(granularite: Granularite, maintenant: Date): Date {
  let curseur = debutDuSeau(maintenant, granularite);
  for (let i = 1; i < POINTS_PAR_GRANULARITE[granularite]; i++) {
    curseur = reculerDUnSeau(curseur, granularite);
  }
  return curseur;
}

export interface Repartition {
  cle: string;
  libelle: string;
  nombre: number;
  /** Part du total, en pourcentage entier — pour la barre de l'écran. */
  pourcentage: number;
}

/**
 * Classe une répartition du plus fréquent au moins fréquent.
 *
 * Les pourcentages sont arrondis à l'entier et NE SONT PAS forcés à 100 : les
 * rattraper en gonflant le plus gros poste produirait un chiffre faux dans une
 * colonne pour que la somme soit jolie. Le total exact est affiché à côté.
 */
export function classer(
  comptes: readonly { cle: string; nombre: number }[],
  libelle: (cle: string) => string,
): Repartition[] {
  const total = comptes.reduce((s, c) => s + c.nombre, 0);
  return [...comptes]
    .sort((a, b) => b.nombre - a.nombre || a.cle.localeCompare(b.cle))
    .map((c) => ({
      cle: c.cle,
      libelle: libelle(c.cle),
      nombre: c.nombre,
      pourcentage: total === 0 ? 0 : Math.round((c.nombre / total) * 100),
    }));
}
