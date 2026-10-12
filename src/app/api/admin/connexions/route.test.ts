// GET /api/admin/connexions — les trois vues de la console en une réponse.
//
// Même patron que me/route.test.ts : `requireAdmin` et le limiteur sont mockés
// pour être pilotés par test, et Prisma ici est un vrai mock de modèle puisque
// la route lit `connexionEvent`.
import { mockNextCookies } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

// `vi.hoisted` est nécessaire ici, et pas dans les tests de cron voisins :
// ceux-là importent leur route par `await import('./route')` à l'intérieur de
// chaque test, donc la fabrique du mock s'exécute après la déclaration du
// `vi.fn()`. Ce fichier importe `GET` statiquement — l'import est remonté en
// tête, la fabrique s'exécute avant le `const`, et l'on obtient « Cannot
// access 'findMany' before initialization ».
const findMany = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/prisma', () => ({ prisma: { connexionEvent: { findMany } } }));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';
import { POINTS_PAR_GRANULARITE } from '@/lib/admin/connexions';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockLimite = vi.mocked(enforceAdminRateLimit);

const adminCtx = {
  user: { sub: 'admin-1', email: 'admin@test.local' },
  admin: { id: 'admin-1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function req(query = ''): NextRequest {
  return new NextRequest(`http://localhost:3000/api/admin/connexions${query}`);
}

/** Quelques connexions, maintenant, pour que les trois vues aient de quoi dire. */
function lignes() {
  const maintenant = new Date();
  return [
    {
      appareil: 'TELEPHONE',
      pays: 'SN',
      methode: 'MOT_DE_PASSE',
      createdAt: maintenant,
      userId: 'u1',
    },
    { appareil: 'TELEPHONE', pays: 'SN', methode: 'GOOGLE', createdAt: maintenant, userId: 'u2' },
    {
      appareil: 'ORDINATEUR',
      pays: 'FR',
      methode: 'MOT_DE_PASSE',
      createdAt: maintenant,
      userId: 'u1',
    },
    {
      appareil: 'TABLETTE',
      pays: null,
      methode: 'VERIFICATION',
      createdAt: maintenant,
      userId: null,
    },
  ];
}

beforeEach(() => {
  mockRequireAdmin.mockReset();
  mockLimite.mockReset();
  findMany.mockReset();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockLimite.mockResolvedValue(undefined as never);
  findMany.mockResolvedValue(lignes());
});

describe('la garde', () => {
  it('rend ce que requireAdmin décide, sans rien calculer', async () => {
    // La vraie garde est dans la route, pas dans l'écran : si elle refuse,
    // aucune requête ne doit partir vers la base.
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }) as never,
    );
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('respecte le limiteur de débit', async () => {
    mockLimite.mockResolvedValueOnce(
      NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 }) as never,
    );
    const res = await GET(req());
    expect(res.status).toBe(429);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('se contente d’ADMIN : ces chiffres ne nomment personne', async () => {
    await GET(req());
    expect(mockRequireAdmin).toHaveBeenCalledWith('ADMIN');
  });
});

describe('l’échelle demandée', () => {
  it('rend le nombre de points prévu pour chaque échelle', async () => {
    for (const g of ['heure', 'jour', 'semaine', 'mois', 'annee'] as const) {
      const res = await GET(req(`?granularite=${g}`));
      const body = await res.json();
      expect(body.granularite, g).toBe(g);
      expect(body.serie, g).toHaveLength(POINTS_PAR_GRANULARITE[g]);
    }
  });

  // Un paramètre d'affichage erroné ne doit pas remplacer un tableau de bord
  // par une erreur — mais il ne doit pas non plus atteindre le calcul.
  it('retombe sur « jour » devant une échelle inconnue', async () => {
    for (const mauvais of ['minute', 'HEURE', '', 'année', '../../etc']) {
      const res = await GET(req(`?granularite=${encodeURIComponent(mauvais)}`));
      expect(res.status, mauvais).toBe(200);
      expect((await res.json()).granularite, mauvais).toBe('jour');
    }
  });

  it('borne la requête dans le temps, et plafonne le volume', async () => {
    await GET(req('?granularite=jour'));
    const args = findMany.mock.calls[0]![0] as {
      where: { createdAt: { gte: Date } };
      take: number;
    };
    expect(args.where.createdAt.gte).toBeInstanceOf(Date);
    // 30 jours en arrière pour l'échelle « jour ».
    const attendu = Date.now() - 29 * 24 * 60 * 60 * 1000;
    expect(args.where.createdAt.gte.getTime()).toBeLessThan(attendu + 24 * 60 * 60 * 1000);
    expect(args.take).toBe(50_000);
  });
});

describe('les trois vues', () => {
  it('classe les appareils du plus fréquent au moins fréquent', async () => {
    const body = await (await GET(req())).json();
    expect(body.appareils.map((a: { cle: string }) => a.cle)).toEqual([
      'TELEPHONE',
      'ORDINATEUR',
      'TABLETTE',
    ]);
    expect(body.appareils[0].nombre).toBe(2);
    expect(body.appareils[0].libelle).toBe('Téléphone');
  });

  it('donne un drapeau à chaque pays, et un neutre à l’inconnu', async () => {
    const body = await (await GET(req())).json();
    const parCle = new Map(body.pays.map((p: { cle: string }) => [p.cle, p]));
    expect((parCle.get('SN') as { drapeau: string }).drapeau).toBe('🇸🇳');
    expect((parCle.get('FR') as { drapeau: string }).drapeau).toBe('🇫🇷');
    // La ligne sans pays garde un glyphe, sinon la colonne se désaligne.
    expect((parCle.get('') as { drapeau: string }).drapeau).toBe('🏳️');
    expect((parCle.get('') as { libelle: string }).libelle).toBe('Pays inconnu');
  });

  it('distingue le nombre de connexions du nombre de comptes', async () => {
    // Quatre connexions, mais deux comptes identifiés et une anonyme : un seul
    // « total » confondrait deux chiffres très différents.
    const body = await (await GET(req())).json();
    expect(body.total).toBe(4);
    expect(body.comptesDistincts).toBe(2);
  });

  it('ventile aussi par chemin de connexion', async () => {
    const body = await (await GET(req())).json();
    const parCle = new Map(body.methodes.map((m: { cle: string }) => [m.cle, m]));
    expect((parCle.get('MOT_DE_PASSE') as { nombre: number }).nombre).toBe(2);
    expect((parCle.get('GOOGLE') as { libelle: string }).libelle).toBe('Google');
  });

  it('annonce la troncature au lieu de la cacher', async () => {
    findMany.mockResolvedValueOnce(Array.from({ length: 50_000 }, () => lignes()[0]!));
    const body = await (await GET(req())).json();
    expect(body.tronque).toBe(true);
  });

  it('répond normalement sur une base vide', async () => {
    findMany.mockResolvedValueOnce([]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(body.appareils).toEqual([]);
    expect(body.pays).toEqual([]);
    // La série reste pleine de zéros : un graphique vide se lit, une absence
    // de graphique ressemble à une panne.
    expect(body.serie).toHaveLength(POINTS_PAR_GRANULARITE.jour);
    expect(body.serie.every((p: { nombre: number }) => p.nombre === 0)).toBe(true);
  });
});
