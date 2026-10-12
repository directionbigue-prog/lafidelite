// Appeler une route de cron depuis un ordonnanceur qui vit en dehors de Next.
//
// POURQUOI CE MODULE EXISTE. Les six tâches de fond de ce produit sont des
// Route Handlers (`app/api/cron/<nom>/route.ts`), et c'est l'hébergeur qui
// décide de les appeler. Chez Vercel, `vercel.json` suffit : la plate-forme
// envoie elle-même un GET avec `Authorization: Bearer ${CRON_SECRET}`. Netlify
// n'a pas cet équivalent — ses Scheduled Functions sont du code, pas une
// déclaration. Il faut donc un appelant, et ce fichier est sa décision.
//
// LA LEÇON QU'IL APPLIQUE. Le 02/10/2026, les six crons ont été déployés morts
// pendant une journée : les handlers n'exportaient que `POST` et Vercel
// n'envoie que des GET. Le symptôme était un 405 collecté par l'ordonnanceur,
// invisible côté application — aucune ligne de log, aucune erreur, aucune
// invocation en échec. Un cron jamais appelé est indiscernable d'un cron
// tranquille. D'où deux règles ici :
//
//   1. On APPELLE la route déjà testée, par HTTP, au lieu de refaire son
//      travail dans la fonction planifiée. Un second chemin voudrait un second
//      client Prisma dans un second bundle, et deux chemins divergent.
//   2. Un échec LÈVE. Netlify marque alors l'invocation en échec et elle est
//      visible dans l'interface. Retourner 200 en journalisant « ok » est
//      exactement la panne de septembre, reproduite à l'identique.
//
// Ce module est pur : aucune dépendance à Next, à Prisma ni à `server-only`.
// C'est ce qui permet de l'importer depuis `netlify/functions/*.mts`, qui sont
// empaquetées séparément, et de le tester ici.

/**
 * Limite d'exécution d'une Scheduled Function Netlify : **30 secondes, non
 * configurable** (documentation Netlify, « Configuration for functions →
 * Default values »). La route appelée, elle, dispose de 60 s.
 *
 * On coupe donc l'attente avant la limite, pour obtenir une erreur qui se
 * nomme plutôt qu'un arrêt opaque de Lambda. Le travail côté route n'est pas
 * annulé pour autant : c'est une autre invocation, qui finit sa vidange de son
 * côté. On perd le compte-rendu, pas le travail.
 */
export const DELAI_MAX_MS = 25_000;

/** Les variables où chercher l'adresse publique du site, par ordre de confiance. */
export const SOURCES_ORIGINE = [
  // Posée à la main : une configuration explicite gagne toujours.
  'APP_URL',
  // Netlify, lecture seule : « URL representing the main address to your
  // site », avec le domaine personnalisé quand il y en a un, schéma inclus.
  'URL',
  // Vercel, lecture seule et SANS schéma — d'où le rattrapage plus bas.
  'VERCEL_PROJECT_PRODUCTION_URL',
  // Netlify encore, pour une branche ou une Deploy Preview.
  'DEPLOY_PRIME_URL',
  // Exposée au navigateur, donc la moins fiable des quatre : elle peut être
  // figée au build alors que les autres décrivent l'exécution en cours.
  'NEXT_PUBLIC_APP_URL',
] as const;

/**
 * L'origine du site, ou `null` si l'environnement n'en porte aucune crédible.
 *
 * Rend `null` plutôt que de deviner : un cron qui appelle `http://localhost`
 * depuis un Lambda n'échoue pas, il réussit à ne rien faire.
 */
export function origineDuSite(env: Record<string, string | undefined>): string | null {
  for (const cle of SOURCES_ORIGINE) {
    const brut = env[cle]?.trim();
    if (!brut) continue;

    // `VERCEL_PROJECT_PRODUCTION_URL` ne porte jamais de schéma ; les autres
    // en portent un. On tolère les deux formes dans les deux sens plutôt que
    // de produire « https://https://… » sur une variable recopiée.
    const avecSchema = /^https?:\/\//i.test(brut) ? brut : `https://${brut}`;

    let url: URL;
    try {
      url = new URL(avecSchema);
    } catch {
      continue;
    }
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') continue;

    return `${url.protocol}//${url.host}`;
  }
  return null;
}

export interface Appel {
  url: string;
  init: RequestInit;
}

/**
 * La requête à envoyer.
 *
 * POST, et non GET : c'est le verbe honnête pour une mutation, et les six
 * handlers l'exportent tous. L'alias `GET = POST` existe pour Vercel, qui
 * n'envoie que des GET ; ici c'est nous qui choisissons, donc on choisit juste.
 */
export function construireAppel(origine: string, nom: string, secret: string): Appel {
  return {
    url: `${origine.replace(/\/+$/, '')}/api/cron/${nom}`,
    init: {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        // Pour retrouver l'appelant dans les logs de la route : une invocation
        // planifiée et un `curl` de diagnostic ne se distinguent pas autrement.
        'user-agent': 'coeurfidele-cron-planifie',
      },
    },
  };
}

export interface Reussite {
  nom: string;
  statut: number;
  /** Le corps, tronqué : il part dans un log, pas dans une réponse. */
  corps: string;
}

/** Ce qu'un échec doit dire pour être diagnosticable sans rejouer l'appel. */
export class EchecCronPlanifie extends Error {
  constructor(
    readonly nom: string,
    readonly statut: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'EchecCronPlanifie';
  }
}

function tronquer(texte: string): string {
  return texte.length > 500 ? `${texte.slice(0, 500)}…` : texte;
}

/**
 * Appelle une route de cron et rend compte.
 *
 * `fetchImpl` et `env` sont injectés parce qu'il n'y a ni jsdom ni serveur de
 * test dans ce dépôt : la seule façon d'éprouver cette décision est de lui
 * passer ses entrées.
 */
export async function executerCron(
  nom: string,
  options: {
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
    delaiMs?: number;
  } = {},
): Promise<Reussite> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;

  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    // Même politique que `verifyCronSecret` côté route : échouer fort et tôt.
    // Sans secret la route répondrait 500 CRON_NOT_CONFIGURED ; autant le dire
    // ici, où le message nomme la variable à poser.
    throw new EchecCronPlanifie(
      nom,
      null,
      `CRON_SECRET est absente de l'environnement de la fonction planifiée. ` +
        `Sur Netlify, vérifiez que la variable est bien portée par le scope « Functions », ` +
        `pas seulement « Builds ».`,
    );
  }

  const origine = origineDuSite(env);
  if (!origine) {
    throw new EchecCronPlanifie(
      nom,
      null,
      `Aucune origine publique dans l'environnement (cherchée dans ${SOURCES_ORIGINE.join(', ')}). ` +
        `Posez APP_URL.`,
    );
  }

  const { url, init } = construireAppel(origine, nom, secret);

  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), options.delaiMs ?? DELAI_MAX_MS);

  let reponse: Response;
  try {
    reponse = await fetchImpl(url, { ...init, signal: stop.signal });
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    throw new EchecCronPlanifie(nom, null, `${url} n'a pas répondu : ${cause}`);
  } finally {
    clearTimeout(minuteur);
  }

  const corps = tronquer(await reponse.text().catch(() => ''));

  if (!reponse.ok) {
    throw new EchecCronPlanifie(
      nom,
      reponse.status,
      `${url} a répondu ${reponse.status}. Corps : ${corps || '(vide)'}`,
    );
  }

  return { nom, statut: reponse.status, corps };
}
