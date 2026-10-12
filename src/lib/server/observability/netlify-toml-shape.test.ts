// Garde-fou : les six tâches de fond sont bien ordonnancées chez Netlify.
//
// POURQUOI CE FICHIER EXISTE. Le 02/10/2026, la première mise en production a
// embarqué les six crons MORTS : les handlers n'exportaient que `POST` et
// Vercel n'envoie que des GET. La panne n'écrit aucune ligne de log, ne lève
// aucune erreur et n'affiche aucune invocation en échec — un cron jamais
// appelé est indiscernable d'un cron tranquille. Elle n'a été trouvée qu'en
// sondant les six chemins depuis l'extérieur.
//
// Le dépôt a changé d'hébergeur le 03/10/2026, et l'ordonnanceur avec. Les
// `crons` de `vercel.json` ne sont lus QUE par Vercel : posés sur Netlify, ils
// ne déclenchent rien, exactement de la même manière silencieuse. Netlify veut
// des Scheduled Functions, c'est-à-dire du code — donc deux listes à tenir
// d'accord, donc un test, parce que rien dans l'application ne peut attraper
// un ordonnanceur qui ne l'appelle pas.
//
// `vercel-json-shape.test.ts` garde l'autre moitié et reste en place : le
// projet Vercel est conservé comme chemin de repli, et une liste de crons qui
// ne vaut que pour un hébergeur sur deux est le début de la dérive.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import fg from 'fast-glob';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '../../../../');
const NETLIFY_TOML = resolve(REPO_ROOT, 'netlify.toml');
const VERCEL_JSON = resolve(REPO_ROOT, 'vercel.json');
const FONCTIONS = resolve(REPO_ROOT, 'netlify/functions');
const ROUTES_CRON = resolve(REPO_ROOT, 'src/app/api/cron');

/** Le préfixe qui lie une fonction planifiée à sa route. */
const PREFIXE = 'cron-';

interface Planifiee {
  fonction: string;
  cron: string;
  schedule: string;
}

/**
 * Lit les blocs `[functions."<nom>"]` et leur `schedule`.
 *
 * À la main : aucun analyseur TOML n'est installé dans ce dépôt, et en ajouter
 * une dépendance pour six lignes coûterait plus que ce qu'elle rapporte. Le
 * fichier est le nôtre et sa forme est stable.
 */
function lirePlanifiees(): Planifiee[] {
  const src = readFileSync(NETLIFY_TOML, 'utf8');
  const sansCommentaires = src
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n');

  const blocs = [
    ...sansCommentaires.matchAll(
      /\[functions\."([^"]+)"\]\s*(?:\r?\n\s*)*schedule\s*=\s*"([^"]+)"/g,
    ),
  ];

  return blocs.map((m) => ({
    fonction: m[1]!,
    cron: m[1]!.startsWith(PREFIXE) ? m[1]!.slice(PREFIXE.length) : m[1]!,
    schedule: m[2]!,
  }));
}

/** Les minutes où un champ `minute` de cron se déclenche. */
function minutes(champ: string): number[] {
  const sortie = new Set<number>();
  for (const morceau of champ.split(',')) {
    const [plage, pasBrut] = morceau.split('/');
    const pas = pasBrut ? Number(pasBrut) : 1;
    let debut = 0;
    let fin = 59;
    if (plage && plage !== '*') {
      const bornes = plage.split('-');
      debut = Number(bornes[0]);
      fin = bornes[1] === undefined ? (pasBrut ? 59 : debut) : Number(bornes[1]);
    }
    for (let m = debut; m <= fin; m += pas) sortie.add(m);
  }
  return [...sortie].sort((a, b) => a - b);
}

async function nomsDesRoutes(): Promise<Set<string>> {
  const fichiers = await fg('*/route.ts', { cwd: ROUTES_CRON, onlyFiles: true });
  return new Set(fichiers.map((f) => f.split('/')[0]!));
}

describe('netlify.toml ordonnance les six tâches de fond', () => {
  it('le fichier existe à la racine du dépôt', () => {
    expect(existsSync(NETLIFY_TOML)).toBe(true);
  });

  it('déclare autant de fonctions planifiées qu’il y a de routes de cron', async () => {
    const routes = await nomsDesRoutes();
    const planifiees = lirePlanifiees();
    // Si la lecture rend zéro, tout le reste de ce fichier passerait à vide.
    expect(planifiees.length).toBeGreaterThan(0);
    expect(planifiees.length).toBe(routes.size);
  });

  it('chaque fonction planifiée correspond à une route existante', async () => {
    const routes = await nomsDesRoutes();
    for (const p of lirePlanifiees()) {
      expect(
        routes.has(p.cron),
        `netlify.toml planifie « ${p.fonction} » mais src/app/api/cron/${p.cron}/route.ts n'existe pas`,
      ).toBe(true);
    }
  });

  it('chaque route de cron est planifiée — c’est l’assertion qui manquait', async () => {
    const planifiees = new Set(lirePlanifiees().map((p) => p.cron));
    for (const route of await nomsDesRoutes()) {
      expect(
        planifiees.has(route),
        `/api/cron/${route} n'est planifiée par aucune fonction Netlify : elle ne sera jamais appelée, sans aucune erreur`,
      ).toBe(true);
    }
  });

  it('couvre exactement les mêmes routes que vercel.json', () => {
    const cfg = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as {
      crons?: { path: string }[];
    };
    const chezVercel = (cfg.crons ?? []).map((c) => c.path.replace('/api/cron/', '')).sort();
    const chezNetlify = lirePlanifiees()
      .map((p) => p.cron)
      .sort();
    expect(chezNetlify).toEqual(chezVercel);
  });

  it('chaque horaire est une expression cron à cinq champs', () => {
    for (const p of lirePlanifiees()) {
      expect(p.schedule.trim().split(/\s+/), `${p.fonction}: « ${p.schedule} »`).toHaveLength(5);
      expect(p.schedule).toMatch(/^[\d*/,\-\s]+$/);
    }
  });

  // L'outbox ALIMENTE la file d'emails : la vider après laisserait partir la
  // file sans ce que l'outbox vient de produire. Chez Vercel la séparation se
  // joue sur l'heure, à cause du jitter Hobby ; ici elle se joue sur la minute.
  it('vide l’outbox avant la file d’emails, à chaque heure', () => {
    const parNom = new Map(lirePlanifiees().map((p) => [p.cron, p]));
    const outbox = parNom.get('outbox-drain');
    const file = parNom.get('email-queue-drain');
    expect(outbox, 'outbox-drain n’est pas planifiée').toBeDefined();
    expect(file, 'email-queue-drain n’est pas planifiée').toBeDefined();

    const mOutbox = minutes(outbox!.schedule.split(/\s+/)[0]!);
    const mFile = minutes(file!.schedule.split(/\s+/)[0]!);
    expect(mOutbox.length).toBeGreaterThan(0);
    expect(mFile.length).toBeGreaterThan(0);

    // Jamais à la même minute : deux invocations simultanées enlèveraient
    // justement la garantie d'ordre qu'on cherche.
    expect(mOutbox.filter((m) => mFile.includes(m))).toEqual([]);

    // Et chaque passage de la file est précédé d'un passage de l'outbox.
    for (const m of mFile) {
      expect(
        mOutbox.some((o) => o < m),
        `la file part à la minute ${m} sans qu'aucune vidange d'outbox ne l'ait précédée dans l'heure`,
      ).toBe(true);
    }
  });
});

describe('les coquilles planifiées ne décident rien', () => {
  const planifiees = lirePlanifiees();

  it('chacune a son fichier dans netlify/functions/', () => {
    for (const p of planifiees) {
      expect(
        existsSync(resolve(FONCTIONS, `${p.fonction}.mts`)),
        `netlify/functions/${p.fonction}.mts manque`,
      ).toBe(true);
    }
  });

  it('chacune appelle executerCron avec le nom de SA route', () => {
    // Un copier-coller qui garde le nom du voisin produirait deux appels à la
    // même route et une route jamais appelée. Rien ne le signalerait.
    for (const p of planifiees) {
      const src = readFileSync(resolve(FONCTIONS, `${p.fonction}.mts`), 'utf8');
      expect(src, p.fonction).toContain(`executerCron('${p.cron}')`);
    }
  });

  it('aucune ne fabrique sa requête elle-même', () => {
    // Le secret, le verbe, l'origine et la limite des 30 s vivent dans le
    // module testé. Un `fetch` écrit ici échapperait à tout : ce dossier n'est
    // ni couvert par `eslint src/` ni par le `include` de tsconfig.
    for (const p of planifiees) {
      const src = readFileSync(resolve(FONCTIONS, `${p.fonction}.mts`), 'utf8');
      const code = src
        .split('\n')
        .filter((l) => !l.trimStart().startsWith('//'))
        .join('\n');
      expect(code, p.fonction).not.toMatch(/\bfetch\s*\(/);
      expect(code, p.fonction).not.toMatch(/Bearer/i);
      expect(code).toContain('appel-planifie');
    }
  });

  it('aucune n’avale son erreur', () => {
    // Une exception marque l'invocation en échec dans l'interface Netlify.
    // L'attraper pour journaliser « ok » est la panne de septembre refaite.
    for (const p of planifiees) {
      const src = readFileSync(resolve(FONCTIONS, `${p.fonction}.mts`), 'utf8');
      const code = src
        .split('\n')
        .filter((l) => !l.trimStart().startsWith('//'))
        .join('\n');
      expect(code, p.fonction).not.toMatch(/\bcatch\b/);
    }
  });
});
