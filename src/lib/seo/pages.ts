// Le registre des pages, et ce que les moteurs ont le droit d'en faire.
//
// POURQUOI UN REGISTRE PLUTÔT QUE DES DÉCLARATIONS ÉPARPILLÉES. « Indexer
// toutes les pages » n'est pas une case à cocher : la moitié des écrans de ce
// produit sont derrière une session, et deux d'entre eux ne doivent surtout
// pas être indexés. Un sitemap écrit à la main se désynchronise au premier
// écran ajouté, et personne ne s'en aperçoit — un sitemap incomplet ne produit
// aucune erreur, juste des pages absentes des résultats.
//
// Ce fichier est donc la seule source : `app/sitemap.ts` et `app/robots.ts` en
// dérivent, et `pages-exhaustif.test.ts` parcourt `src/app/**/page.tsx` pour
// exiger qu'aucun écran n'y manque. Ajouter une page sans l'y déclarer casse
// le CI, ce qui est le seul moment où quelqu'un y pensera.
//
// LE CAS QUI COMPTE : `/invite/[code]` porte un code d'appariement à six
// chiffres, valable sept jours. Indexer une seule de ces URL publierait le
// code dans un moteur de recherche, et n'importe qui pourrait rejoindre
// l'Espace Couple de quelqu'un d'autre. Elle est donc interdite deux fois —
// `Disallow` dans robots.txt ET `noindex` sur le segment — parce qu'un
// `Disallow` seul n'empêche PAS l'indexation d'une URL découverte ailleurs :
// il empêche la visite, pas l'inscription au catalogue.

import { urlPubliqueCredible } from '@/lib/server/app-url';

/**
 * Le domaine du produit, en dernier recours.
 *
 * Écrit en dur parce qu'il DOIT exister même quand l'environnement ment : une
 * canonique vide ou locale est pire qu'une canonique figée.
 */
const DOMAINE_PAR_DEFAUT = 'https://www.coeurfidele.net';

/**
 * Résout l'origine canonique, en refusant ce qui ne peut pas être public.
 *
 * MESURÉ EN PRODUCTION LE 03/10/2026 : `APP_URL` valait encore
 * `http://localhost:3000`, et la première version de ce module la prenait
 * telle quelle. Résultat servi sur le domaine : un sitemap listant cinq URL
 * `http://localhost:3000/…`, une canonique vers localhost sur chaque page, et
 * une `og:image` que nul réseau social ne pouvait charger. Rien n'échouait —
 * le sitemap était valide, simplement inutile.
 *
 * C'est la même variable qui avait cassé les liens d'invitation. Celles-là ont
 * été réparées en déduisant l'origine des en-têtes de la requête, mais les
 * métadonnées sont évaluées au BUILD, où il n'y a pas de requête. Il faut donc
 * ici un filtre, pas une déduction : `urlPubliqueCredible` refuse déjà localhost
 * en production, et c'est exactement le jugement qu'il faut.
 *
 * Pur et paramétré pour être testable : `process.env` lu au chargement d'un
 * module ne se stubbe pas après coup.
 */
export function resoudreOrigineCanonique(
  // `Record` plutôt qu'un objet aux trois clés nommées : `process.env` est typé
  // `ProcessEnv`, et TypeScript refuse de l'affecter à une forme fermée dont il
  // ne partage aucune propriété déclarée.
  env: Record<string, string | undefined>,
  enProduction: boolean,
): string {
  const candidats = [
    env.NEXT_PUBLIC_APP_URL,
    env.APP_URL,
    // Puis ce que l'hébergeur annonce de lui-même, pour que le build ne dépende
    // pas d'un réglage manuel. Netlify pose `URL` — « the main address to your
    // site », schéma inclus et domaine personnalisé compris. Vercel pose
    // `VERCEL_PROJECT_PRODUCTION_URL`, sans schéma, d'où le rattrapage.
    //
    // `URL` passe en premier parce qu'une seule des deux existe à la fois : la
    // présence de l'une est le signal de l'hôte sur lequel on construit.
    env.URL,
    env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, '')}`
      : undefined,
  ];
  for (const candidat of candidats) {
    const credible = urlPubliqueCredible(candidat, enProduction);
    if (credible) return credible.replace(/\/+$/, '');
  }
  return DOMAINE_PAR_DEFAUT;
}

/** L'origine canonique. Tout le reste en découle. */
export const ORIGINE_CANONIQUE = resoudreOrigineCanonique(
  process.env,
  process.env.NODE_ENV === 'production',
);

export interface PageReferencee {
  /** Le chemin servi, sans origine ni barre finale (sauf la racine). */
  chemin: string;
  /**
   * Indexable ? Faux pour tout ce qui exige une session : un moteur n'y verra
   * jamais que l'écran de chargement ou une redirection, et une fiche de
   * résultat qui mène à « connectez-vous » dessert plus qu'elle ne sert.
   */
  indexable: boolean;
  /** Pourquoi pas. Obligatoire quand `indexable` est faux — voir le test. */
  raison?: string;
  /** Pour le sitemap : 1 pour l'accueil, moins pour le reste. */
  priorite?: number;
  frequence?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** Le titre de la page, quand elle en mérite un qui lui est propre. */
  titre?: string;
  description?: string;
  /**
   * Le segment porte-t-il un paramètre dynamique ?
   *
   * Une telle page n'entre JAMAIS dans un sitemap : l'URL n'existe que pour
   * un destinataire, et l'énumérer reviendrait à publier ce qu'elle protège.
   */
  dynamique?: boolean;
}

export const PAGES: readonly PageReferencee[] = [
  {
    chemin: '/',
    indexable: true,
    priorite: 1,
    frequence: 'weekly',
    titre: 'Cœur Fidèle — le jeu de couple sur la fidélité',
    description:
      'Un jeu à deux, côte à côte ou chacun sur son téléphone. Trois manches, des questions qu’on n’ose pas poser, et un score commun — jamais l’un contre l’autre.',
  },
  {
    chemin: '/tarifs',
    indexable: true,
    priorite: 0.8,
    frequence: 'weekly',
    titre: 'Nos packs',
    description:
      'Week-end, Semaine ou Mois : les trois paliers ouvrent le même catalogue, seule la durée change. Une partie est offerte, sans carte.',
  },
  {
    chemin: '/demo',
    indexable: true,
    priorite: 0.9,
    frequence: 'monthly',
    titre: 'Essayer sans compte',
    description:
      'Une manche contre le vrai moteur du jeu, sans inscription et sans carte. De quoi savoir si c’est pour vous.',
  },
  {
    chemin: '/connexion',
    indexable: true,
    priorite: 0.4,
    frequence: 'yearly',
    titre: 'Se connecter',
    description: 'Retrouvez votre Espace Couple et reprenez la partie où vous l’avez laissée.',
  },
  {
    chemin: '/inscription',
    indexable: true,
    priorite: 0.6,
    frequence: 'yearly',
    titre: 'Créer un compte',
    description:
      'Créez votre Espace Couple en deux minutes. La première partie est offerte, et aucune carte n’est demandée.',
  },

  // ─── Tout ce qui suit exige une session, ou protège quelque chose. ───

  {
    chemin: '/mot-de-passe-oublie',
    indexable: false,
    raison: 'Formulaire utilitaire : une fiche de résultat vers un champ vide ne sert personne.',
  },
  {
    chemin: '/reinitialiser-mot-de-passe',
    indexable: false,
    raison: 'Atteinte avec un jeton à usage unique ; l’URL nue n’a aucun sens.',
  },
  {
    chemin: '/verify-email',
    indexable: false,
    raison: 'Étape d’inscription, atteinte avec un code. Rien à y lire sans lui.',
  },
  {
    chemin: '/auth/error',
    indexable: false,
    raison: 'Page d’erreur. Indexer une erreur place un message d’échec dans les résultats.',
  },
  {
    chemin: '/jeu',
    indexable: false,
    raison: 'Derrière la session : un moteur n’y verrait qu’une redirection vers /connexion.',
  },
  {
    chemin: '/jeu/nouvelle',
    indexable: false,
    raison:
      'Derrière la session : l’écran décide s’il reste une partie offerte, ce qui n’a de sens que pour un compte.',
  },
  {
    chemin: '/jeu/[id]/question',
    indexable: false,
    dynamique: true,
    raison: 'Contenu d’une partie en cours : propre à un couple, et jamais public.',
  },
  {
    chemin: '/jeu/[id]/passe',
    indexable: false,
    dynamique: true,
    raison: 'Contenu d’une partie en cours : propre à un couple, et jamais public.',
  },
  {
    chemin: '/jeu/[id]/manche-intro',
    indexable: false,
    dynamique: true,
    raison: 'Contenu d’une partie en cours : propre à un couple, et jamais public.',
  },
  {
    chemin: '/jeu/[id]/manche-revelee',
    indexable: false,
    dynamique: true,
    raison: 'Contenu d’une partie en cours : propre à un couple, et jamais public.',
  },
  {
    chemin: '/jeu/[id]/resultats',
    indexable: false,
    dynamique: true,
    raison: 'Le résultat d’un couple. L’indexer publierait leur score.',
  },
  {
    chemin: '/salon',
    indexable: false,
    raison: 'Derrière la session, et la création d’une partie exige un pack.',
  },
  {
    chemin: '/salon/dames',
    indexable: false,
    raison: 'Derrière la session : l’écran rend un plateau de partie, pas une présentation du jeu.',
  },
  {
    chemin: '/salon/awale',
    indexable: false,
    raison: 'Derrière la session : l’écran rend un plateau de partie, pas une présentation du jeu.',
  },
  {
    chemin: '/salon/ludo',
    indexable: false,
    raison: 'Derrière la session : l’écran rend un plateau de partie, pas une présentation du jeu.',
  },
  {
    chemin: '/salon/mot',
    indexable: false,
    raison: 'Derrière la session : l’écran rend une grille de partie, pas une présentation du jeu.',
  },
  {
    chemin: '/salon/mots-croises',
    indexable: false,
    raison: 'Derrière la session : l’écran rend une grille de partie, pas une présentation du jeu.',
  },
  {
    chemin: '/couple/creer',
    indexable: false,
    raison: 'Derrière la session : crée un Espace Couple et émet un code d’invitation.',
  },
  {
    chemin: '/couple/attente',
    indexable: false,
    raison: 'Derrière la session : affiche le code d’invitation du couple en attente.',
  },
  {
    chemin: '/couple/apparies',
    indexable: false,
    raison: 'Derrière la session : confirme l’appariement et nomme le partenaire.',
  },
  {
    chemin: '/invite/[code]',
    indexable: false,
    dynamique: true,
    raison:
      'Porte un code d’appariement valable sept jours. L’indexer permettrait à n’importe qui de rejoindre l’Espace Couple d’un autre.',
  },
  {
    chemin: '/settings',
    indexable: false,
    raison: 'Derrière la session : réglages d’un compte, et rien d’autre à y lire.',
  },
  {
    chemin: '/admin',
    indexable: false,
    raison: 'Console d’administration. Rien n’y a sa place dans un moteur.',
  },
  {
    chemin: '/admin/tableau-de-bord',
    indexable: false,
    raison: 'Tableau de bord du super-administrateur : chiffres internes, rien de public.',
  },
  {
    chemin: '/paiement/[id]',
    indexable: false,
    dynamique: true,
    raison: 'Le retour de paiement d’une commande : propre à un compte, jamais public.',
  },
  {
    chemin: '/acheter/[pack]',
    indexable: false,
    dynamique: true,
    raison: 'Le passage vers la caisse : il ouvre une commande pour la session en cours.',
  },
  {
    chemin: '/rituel',
    indexable: false,
    raison: 'Derrière la session : la question du jour, la série et les souvenirs d’un couple.',
  },
];

/**
 * Les métadonnées d'une page publique, construites depuis le registre.
 *
 * Les pages l'appellent au lieu de réécrire leur titre : c'est ce qui garantit
 * que le `<title>`, la canonique, la carte de partage et l'entrée du sitemap
 * parlent de la même page. Une description recopiée à la main dérive — celle
 * de /tarifs annonçait encore des paliers supprimés après leur retrait.
 *
 * Le type de retour est volontairement large (`Record`) plutôt que `Metadata`
 * de Next : ce module est importé par des tests qui ne chargent pas Next, et
 * par `app/sitemap.ts` qui, lui, le fait.
 */
export function metadataDePage(chemin: string): {
  title?: string;
  description?: string;
  alternates: { canonical: string };
  openGraph?: { title?: string; description?: string; url: string };
} {
  const page = pageDuChemin(chemin);
  if (!page) {
    // Un chemin absent du registre est une erreur de programmation, pas une
    // condition d'exécution : mieux vaut l'apprendre au build que servir une
    // canonique vide en production.
    throw new Error(`metadataDePage: « ${chemin} » n'est pas déclaré dans PAGES`);
  }
  return {
    ...(page.titre ? { title: page.titre } : {}),
    ...(page.description ? { description: page.description } : {}),
    alternates: { canonical: page.chemin },
    openGraph: {
      ...(page.titre ? { title: page.titre } : {}),
      ...(page.description ? { description: page.description } : {}),
      url: page.chemin,
    },
  };
}

/** Les pages qui entrent dans le sitemap : indexables et non dynamiques. */
export const PAGES_INDEXABLES: readonly PageReferencee[] = PAGES.filter(
  (p) => p.indexable && !p.dynamique,
);

export function pageDuChemin(chemin: string): PageReferencee | undefined {
  return PAGES.find((p) => p.chemin === chemin);
}

export function urlAbsolue(chemin: string): string {
  return chemin === '/' ? `${ORIGINE_CANONIQUE}/` : `${ORIGINE_CANONIQUE}${chemin}`;
}

/**
 * Les préfixes refusés aux robots, déduits des pages non indexables.
 *
 * Réduits à leur segment de tête : `/salon/dames`, `/salon/awale`… tiennent en
 * un seul `Disallow: /salon`. Une liste de vingt lignes où trois suffisent se
 * désynchronise à la première page ajoutée.
 *
 * `/api` s'y ajoute bien qu'aucune route ne soit une page : un robot qui
 * parcourt les routes d'API consomme le budget de crawl et déclenche les
 * limiteurs de débit pour rien.
 */
export const PREFIXES_INTERDITS: readonly string[] = [
  ...new Set(
    PAGES.filter((p) => !p.indexable).map((p) => {
      const segments = p.chemin.split('/').filter(Boolean);
      const tete = segments[0];
      // Une page de premier niveau se refuse en entier ; un sous-chemin se
      // refuse par sa racine, ce qui couvre tous ses frères.
      return tete ? `/${tete}` : p.chemin;
    }),
  ),
  '/api',
].sort();
