// Les paliers d'accès — ce que chaque pack débloque, et pour combien de temps.
//
// Registre unique, pur et sans Prisma : le serveur décide avec, l'écran de
// tarifs affiche avec, le sélecteur de thèmes grise avec. Un prix ou une
// liste de thèmes qui vivrait aussi dans un composant finirait par diverger
// — c'est très exactement ce qui était arrivé aux huit thèmes, annoncés sur
// la page d'accueil et absents de la banque.
//
// LE PRIX N'EST JAMAIS LU DEPUIS LE CLIENT. `POST /api/orders` résout le
// montant ici, à partir du seul `packId`, et ignore ce que le corps de la
// requête annonce. Sans cela, n'importe qui achèterait l'Intégral à 1 FCFA
// en modifiant un champ JSON.
import { NOMS_THEMES } from './themes';

export type PackId = 'DECOUVERTE' | 'WEEKEND' | 'ESSENTIEL' | 'INTEGRAL' | 'ANNUEL';

export interface Pack {
  id: PackId;
  nom: string;
  /** Montant en plus petite unité de la devise. XOF n'a pas de décimales. */
  prix: number;
  devise: string;
  /**
   * Durée du droit, EN JOURS. 0 pour le palier gratuit, qui n'expire pas.
   *
   * C'était `dureeMois` jusqu'au 02/10/2026. Le mois était la seule unité
   * possible, et il rendait indescriptibles les deux paliers courts décidés
   * ce jour-là : un week-end et une semaine. Le jour divise le mois sans
   * reste ; l'inverse était faux, donc le changement d'unité n'enlève rien.
   *
   * Un effet de bord à connaître : un « mois » vaut maintenant 30 jours fixes
   * plutôt que « le même quantième le mois suivant ». Un achat du 31 janvier
   * ne tombe donc plus sur un 28 février inexistant — `setMonth` ramenait
   * silencieusement au 3 mars. La durée est désormais la même pour tout le
   * monde, ce qui est aussi plus facile à annoncer.
   */
  dureeJours: number;
  /** Pour l'affichage : « le week-end », « par semaine », « par mois »… */
  periode: string | null;
  /** Les thèmes que ce palier ouvre, dans l'ordre du registre des thèmes. */
  themes: readonly string[];
  /** Le Salon est-il inclus ? */
  salon: boolean;
  /**
   * Ce palier est-il encore proposé à l'achat ?
   *
   * Un palier retiré de la vente RESTE dans le registre, et ce n'est pas un
   * détail : `Entitlement.packId` garde la chaîne telle quelle, donc le
   * supprimer ferait rendre `null` à `packParId` pour des clients qui ont
   * payé, et `packEffectif` les ferait retomber sur Découverte. On cesse de
   * vendre ; on ne révoque pas.
   */
  enVente: boolean;
  resume: string;
}

/**
 * Ce que le client LIT, là où `devise` porte ce que la caisse ENVOIE.
 *
 * `devise` vaut « XOF », le code ISO 4217 qu'attend le prestataire de
 * paiement, et il doit le rester. Mais c'était aussi la chaîne affichée :
 * /tarifs annonçait « 4 900 XOF » pendant que l'accueil annonçait
 * « 4 900 F · FCFA ». Deux étiquettes pour la même somme dans le même
 * produit, et aucune des deux n'était celle qu'on lit à Dakar.
 *
 * Une seule constante, donc, et c'est elle que toute surface de vente
 * affiche — jamais `pack.devise`.
 */
export const LIBELLE_DEVISE = 'FCFA';

/**
 * Les trois paliers payants ouvrent TOUT le catalogue. Seule la durée change.
 *
 * C'est une décision produit prise le 02/10/2026, et elle remplace une échelle
 * de contenu où l'Essentiel n'ouvrait que six thèmes sur huit. L'offre est
 * désormais un laissez-passer : week-end, semaine ou mois.
 *
 * Personne n'y perd. Un Essentiel acheté sous l'ancienne règle ouvrait six
 * thèmes ; il en ouvre huit à partir d'aujourd'hui, parce que le registre est
 * lu au moment de la décision et non figé à l'achat. La durée, elle, est gelée
 * dans `Entitlement.expiresAt` au moment de l'achat : raccourcir l'Essentiel
 * d'un mois à une semaine ne raccourcit donc AUCUN droit déjà vendu.
 */
const TOUT_LE_CATALOGUE = NOMS_THEMES;

/** Le seul thème ouvert sans payer, pour essayer après l'inscription. */
export const THEME_DECOUVERTE = 'Confiance & Jalousie';

export const PACKS: readonly Pack[] = [
  {
    id: 'DECOUVERTE',
    nom: 'Découverte',
    prix: 0,
    devise: 'XOF',
    dureeJours: 0,
    periode: null,
    themes: [THEME_DECOUVERTE],
    salon: false,
    enVente: true,
    resume: 'Un essai après l’inscription, sur un seul thème.',
  },
  {
    id: 'WEEKEND',
    nom: 'Week-end',
    prix: 2_000,
    devise: 'XOF',
    // Deux jours : le temps d'une soirée et de son lendemain. C'est la durée
    // décidée, pas une approximation du week-end calendaire — le droit court
    // 48 h à partir de l'achat, quel que soit le jour de la semaine.
    dureeJours: 2,
    periode: 'pour deux jours',
    themes: TOUT_LE_CATALOGUE,
    salon: true,
    enVente: true,
    resume: 'Tout le catalogue et le Salon, le temps d’un week-end.',
  },
  {
    id: 'ESSENTIEL',
    nom: 'Semaine',
    prix: 4_900,
    devise: 'XOF',
    dureeJours: 7,
    periode: 'par semaine',
    themes: TOUT_LE_CATALOGUE,
    salon: true,
    enVente: true,
    // L'identifiant reste ESSENTIEL alors que le nom affiché devient
    // « Semaine » : des lignes Entitlement vendues sous ce nom existent déjà
    // en base, et renommer l'identifiant les rendrait introuvables.
    resume: 'Tout le catalogue et le Salon, pendant sept jours.',
  },
  {
    id: 'INTEGRAL',
    nom: 'Mois',
    prix: 9_900,
    devise: 'XOF',
    dureeJours: 30,
    periode: 'par mois',
    themes: TOUT_LE_CATALOGUE,
    salon: true,
    enVente: true,
    resume: 'Tout le catalogue et le Salon, pendant trente jours.',
  },
  {
    id: 'ANNUEL',
    nom: 'Annuel',
    prix: 9_900 * 12,
    devise: 'XOF',
    dureeJours: 365,
    periode: 'par an',
    themes: TOUT_LE_CATALOGUE,
    salon: true,
    // RETIRÉ DE LA VENTE le 02/10/2026, et conservé ici exprès : des droits
    // annuels déjà payés courent encore, et `packParId('ANNUEL')` doit
    // continuer de les résoudre. Supprimer l'entrée les ferait retomber sur
    // Découverte — on cesse de vendre, on ne révoque pas.
    enVente: false,
    resume: 'Retiré de la vente. Les droits en cours vont à leur terme.',
  },
] as const;

export const PACK_PAR_DEFAUT: PackId = 'DECOUVERTE';

/** Les paliers qui se paient — ceux qu'un écran de tarifs met en vente. */
export const PACKS_PAYANTS: readonly Pack[] = PACKS.filter((p) => p.prix > 0 && p.enVente);

/**
 * Tout ce qu'un écran de tarifs doit montrer — Découverte compris, l'Annuel
 * retiré.
 *
 * Existe pour que la page de tarifs n'itère plus sur `PACKS`, qui contient
 * désormais un palier qui n'est plus à vendre.
 */
export const PACKS_VISIBLES: readonly Pack[] = PACKS.filter((p) => p.enVente);

/**
 * Ce palier peut-il encore être acheté ?
 *
 * À appeler avant de créer une commande. Un palier hors vente reste résoluble
 * par `packParId` — c'est tout l'intérêt — donc rien n'empêcherait d'en
 * commander un sans cette vérification.
 */
export function estAchetable(pack: Pack | null | undefined): boolean {
  return !!pack && pack.prix > 0 && pack.enVente;
}

export function packParId(id: string | null | undefined): Pack | null {
  return PACKS.find((p) => p.id === id) ?? null;
}

/**
 * Le pack par défaut, garanti non nul.
 *
 * Existe pour que les appelants n'aient pas à gérer un `null` qui ne peut
 * pas arriver, et pour qu'une faute de frappe dans `PACK_PAR_DEFAUT` casse
 * ici plutôt que trois couches plus loin.
 */
export function packDecouverte(): Pack {
  const pack = packParId(PACK_PAR_DEFAUT);
  if (!pack) throw new Error('PACK_PAR_DEFAUT ne correspond à aucun pack du registre');
  return pack;
}

/**
 * Le rang d'un palier, pour comparer deux droits actifs.
 *
 * Un compte peut détenir plusieurs droits en même temps — un Essentiel en
 * cours, puis un Intégral acheté par-dessus. On ne les additionne pas et on
 * ne les remplace pas : on retient le plus généreux tant qu'il est valide.
 * Résilier ou rembourser l'un laisse donc l'autre intact, ce qui est le
 * comportement attendu et ce qu'un champ `User.packId` unique aurait rendu
 * impossible à représenter.
 */
export function rangDuPack(id: PackId): number {
  return PACKS.findIndex((p) => p.id === id);
}

/** Un droit d'accès, réduit à ce dont la décision a besoin. */
export interface DroitAcces {
  packId: string;
  expiresAt: Date;
}

/**
 * Le pack effectif : le meilleur droit encore valide, ou Découverte.
 *
 * `maintenant` est un paramètre et non `new Date()` : la décision est
 * testable à la seconde près, et un droit qui expire pendant une partie ne
 * dépend pas de l'horloge au moment où le code est lu.
 *
 * Un `packId` inconnu — palier retiré du registre après une vente — est
 * ignoré plutôt que de faire échouer la résolution : le compte retombe sur
 * le palier inférieur qu'il détient encore, et au pire sur Découverte.
 */
export function packEffectif(droits: readonly DroitAcces[], maintenant: Date): Pack {
  let meilleur = packDecouverte();
  for (const droit of droits) {
    if (droit.expiresAt.getTime() <= maintenant.getTime()) continue;
    const pack = packParId(droit.packId);
    if (!pack) continue;
    if (rangDuPack(pack.id) > rangDuPack(meilleur.id)) meilleur = pack;
  }
  return meilleur;
}

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

/**
 * La date de fin d'un droit acheté maintenant.
 *
 * Arithmétique en millisecondes, et non `setMonth` / `setDate`. Les deux
 * méthodes du calendrier normalisent les dates impossibles en silence :
 * `setMonth` sur un 31 janvier donnait un 3 mars, et un droit « d'un mois »
 * valait alors trente et un jours pour les uns, vingt-huit pour les autres.
 * En millisecondes la durée vendue est la durée reçue, pour tout le monde.
 *
 * Le changement d'heure ne fait pas exception : deux jours valent 48 heures
 * ici, pas « le surlendemain à la même heure ». C'est volontaire — un droit
 * qui durerait une heure de moins deux fois par an serait injustifiable, et
 * il serait invisible jusqu'à la réclamation.
 */
export function finDuDroit(pack: Pack, debut: Date): Date {
  return new Date(debut.getTime() + pack.dureeJours * MS_PAR_JOUR);
}

export function themeOuvert(pack: Pack, nom: string): boolean {
  return pack.themes.includes(nom);
}

/**
 * Le palier le MOINS cher qui ouvre ce thème.
 *
 * C'est ce que le sélecteur affiche sur une carte verrouillée : « Essentiel »
 * plutôt que « payant », parce qu'un joueur à qui l'on dit lequel des trois
 * paliers suffit n'a pas besoin d'aller comparer la page de tarifs.
 *
 * `PACKS` est ordonné du moins cher au plus cher, donc le premier trouvé
 * est le bon. Un thème qu'aucun palier n'ouvrirait rend `null` — invendable,
 * et le test l'interdit pour les huit thèmes livrés.
 */
export function palierDuTheme(nom: string): Pack | null {
  return PACKS.find((p) => p.themes.includes(nom)) ?? null;
}

/** Ce palier ouvre-t-il TOUT le catalogue de thèmes ? */
export function ouvreToutLeCatalogue(pack: Pack): boolean {
  return pack.themes.length >= NOMS_THEMES.length;
}

export interface VerdictThemes {
  /** Les thèmes à transmettre au tirage, ou `undefined` pour toute la banque. */
  categories: string[] | undefined;
  /** Les thèmes demandés que le palier n'ouvre pas. Vide = rien à refuser. */
  refuses: string[];
}

/**
 * Ce qu'un couple a le droit de jouer, à partir de ce qu'il a demandé.
 *
 * Trois cas, et le deuxième est celui qui compte :
 *
 *   · demande contenant un thème fermé → on le RENVOIE dans `refuses`. On
 *     ne le retire pas en silence. Retirer sans le dire reproduirait le
 *     défaut que le lot précédent a supprimé : une sélection ignorée, une
 *     partie qui parle d'autre chose, et personne pour s'en apercevoir.
 *
 *   · aucune demande, palier partiel → on restreint aux thèmes ouverts.
 *     Sans cela un compte Découverte tirerait dans toute la banque en ne
 *     cochant simplement rien, ce qui rendrait le palier décoratif.
 *
 *   · aucune demande, palier complet → `undefined`, donc toute la banque,
 *     fonds général compris. C'est le seul cas où le tirage n'est pas
 *     restreint.
 */
export function verifierThemes(pack: Pack, demandes: readonly string[]): VerdictThemes {
  const refuses = demandes.filter((nom) => !themeOuvert(pack, nom));
  if (refuses.length > 0) return { categories: undefined, refuses };

  if (demandes.length > 0) return { categories: [...demandes], refuses: [] };

  return {
    categories: ouvreToutLeCatalogue(pack) ? undefined : [...pack.themes],
    refuses: [],
  };
}
