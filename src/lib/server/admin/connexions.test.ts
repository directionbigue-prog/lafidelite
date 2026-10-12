import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// `after()` exécute normalement sa fonction une fois la réponse rendue. Ici on
// l'appelle tout de suite, pour pouvoir observer ce qui part en base.
const taches: (() => unknown)[] = [];
// `vi.fn()` et non une fonction nue : un test doit pouvoir faire LEVER `after`,
// ce qui est le cas réel hors contexte de requête. Avec une fonction nue,
// `mockImplementationOnce` n'existe pas et l'appel passait en silence — le test
// restait vert sans jamais exercer le chemin qu'il prétendait couvrir.
const after = vi.fn((fn: () => unknown) => {
  taches.push(fn);
});
vi.mock('next/server', () => ({ after: (fn: () => unknown) => after(fn) }));

const create = vi.fn();
vi.mock('@/lib/server/prisma', () => ({ prisma: { connexionEvent: { create } } }));

const warn = vi.fn();
vi.mock('@/lib/server/logger', () => ({ createLogger: () => ({ warn, info: vi.fn() }) }));

const { donneesDeConnexion, enregistrerConnexion, METHODES, libelleMethode } =
  await import('./connexions');

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(here, '../../../../prisma/schema.prisma');

const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';

function entetes(extra: Record<string, string> = {}): Headers {
  return new Headers({
    'user-agent': UA_IPHONE,
    'x-vercel-ip-country': 'SN',
    // Les en-têtes qui portent l'adresse. Présents à chaque requête réelle, et
    // c'est précisément ce qui doit NE PAS être conservé.
    'x-forwarded-for': '41.82.17.9, 10.0.0.1',
    'x-real-ip': '41.82.17.9',
    'x-vercel-forwarded-for': '41.82.17.9',
    ...extra,
  });
}

beforeEach(() => {
  taches.length = 0;
  create.mockReset();
  create.mockResolvedValue({ id: 'c1' });
  warn.mockReset();
});

describe('ce qui est retenu d’une requête', () => {
  it('déduit l’appareil et le pays', () => {
    expect(donneesDeConnexion(entetes(), 'MOT_DE_PASSE')).toEqual({
      appareil: 'TELEPHONE',
      pays: 'SN',
      methode: 'MOT_DE_PASSE',
    });
  });

  // L'ASSERTION QUI COMPTE. Le modèle n'a pas de colonne pour l'IP, mais une
  // colonne absente n'empêche pas de la faire passer dans un champ texte — et
  // « pays » est un champ texte. On vérifie donc la VALEUR produite, pas
  // seulement la forme du schéma.
  it('ne retient NI l’adresse IP NI la chaîne du navigateur', () => {
    const d = donneesDeConnexion(entetes(), 'MOT_DE_PASSE');
    const serialise = JSON.stringify(d);
    expect(serialise).not.toContain('41.82.17.9');
    expect(serialise).not.toContain('10.0.0.1');
    expect(serialise).not.toContain('iPhone');
    expect(serialise).not.toContain('Mozilla');
    expect(serialise).not.toContain('AppleWebKit');
    // Et rien d'autre que les trois champs déclarés.
    expect(Object.keys(d).sort()).toEqual(['appareil', 'methode', 'pays']);
  });

  it('accepte l’absence de pays sans inventer une valeur', () => {
    const h = new Headers({ 'user-agent': UA_IPHONE });
    expect(donneesDeConnexion(h, 'GOOGLE').pays).toBeNull();
  });

  it('refuse un en-tête de pays fabriqué', () => {
    // L'en-tête vient de la plateforme en production, mais rien n'empêche un
    // client de l'envoyer lui-même.
    const h = entetes({ 'x-vercel-ip-country': "'; DROP TABLE" });
    expect(donneesDeConnexion(h, 'MOT_DE_PASSE').pays).toBeNull();
  });

  it('a un libellé pour chaque méthode déclarée', () => {
    expect(METHODES).toEqual(['MOT_DE_PASSE', 'VERIFICATION', 'GOOGLE']);
    for (const m of METHODES) {
      expect(libelleMethode(m), m).not.toBe(m);
    }
  });
});

describe('l’enregistrement ne peut pas casser une connexion', () => {
  it('écrit après la réponse, pas pendant', () => {
    enregistrerConnexion({ headers: entetes(), methode: 'MOT_DE_PASSE', userId: 'u1' });
    // Rien n'est encore parti : la requête de connexion n'attend pas.
    expect(create).not.toHaveBeenCalled();
    expect(taches).toHaveLength(1);
  });

  it('insère les bons champs, et seulement eux', async () => {
    enregistrerConnexion({ headers: entetes(), methode: 'VERIFICATION', userId: 'u1' });
    await taches[0]!();
    expect(create).toHaveBeenCalledTimes(1);
    const data = (create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).toEqual({
      userId: 'u1',
      appareil: 'TELEPHONE',
      pays: 'SN',
      methode: 'VERIFICATION',
    });
    // Rien qui ressemble à une adresse n'a atteint la base.
    expect(JSON.stringify(data)).not.toContain('41.82.17.9');
  });

  // Le scénario qui arrivera réellement : la migration n'est pas encore
  // appliquée en production, donc la table n'existe pas.
  it('avale une erreur d’insertion et la journalise', async () => {
    create.mockRejectedValueOnce(new Error('relation "ConnexionEvent" does not exist'));
    enregistrerConnexion({ headers: entetes(), methode: 'MOT_DE_PASSE', userId: 'u1' });
    await expect(taches[0]!()).resolves.not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('statistique perdue');
  });

  it('survit à l’absence de contexte de requête', () => {
    // C'est ce que fait réellement `after()` hors d'une requête — le cas des
    // tests unitaires de route, et de tout appel depuis un script.
    after.mockImplementationOnce(() => {
      throw new Error('after() called outside a request scope');
    });
    expect(() =>
      enregistrerConnexion({ headers: entetes(), methode: 'GOOGLE', userId: null }),
    ).not.toThrow();
    // La connexion aboutit, et le trou est annoncé dans les journaux.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('pas de contexte de requête');
    expect(create).not.toHaveBeenCalled();
  });

  it('accepte une connexion sans compte identifié', async () => {
    enregistrerConnexion({ headers: entetes(), methode: 'GOOGLE', userId: null });
    await taches[0]!();
    const data = (create.mock.calls[0]![0] as { data: { userId: string | null } }).data;
    expect(data.userId).toBeNull();
  });
});

describe('le modèle lui-même ne peut pas stocker une adresse', () => {
  const schema = readFileSync(SCHEMA, 'utf8');
  const modele = /model ConnexionEvent \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? '';

  it('le modèle existe', () => {
    expect(modele, 'ConnexionEvent absent de schema.prisma').not.toBe('');
  });

  it('n’a aucun champ d’adresse ni de navigateur', () => {
    // Les commentaires du modèle PARLENT de l'IP pour expliquer pourquoi elle
    // n'y est pas : il faut donc les retirer avant de chercher, sinon ce test
    // échoue sur sa propre documentation. Même leçon que cron-get-alias.
    const sansCommentaires = modele.replace(/\/\/[^\n]*/g, '');
    for (const interdit of ['ip', 'ipAddress', 'userAgent', 'ua ', 'adresse']) {
      expect(sansCommentaires.toLowerCase(), interdit).not.toContain(interdit.toLowerCase());
    }
  });

  it('ne garde que les colonnes attendues', () => {
    const sansCommentaires = modele.replace(/\/\/[^\n]*/g, '');
    const champs = [...sansCommentaires.matchAll(/^\s{2}(\w+)\s+\S/gm)].map((m) => m[1]);
    expect(champs!.sort()).toEqual(
      ['appareil', 'createdAt', 'id', 'methode', 'pays', 'user', 'userId'].sort(),
    );
  });

  it('s’efface avec le compte', () => {
    // Supprimer un utilisateur doit effacer ses traces de connexion ; sans
    // cascade, elles survivraient au compte.
    expect(modele).toContain('onDelete: Cascade');
  });
});
