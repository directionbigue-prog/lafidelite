import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

import { createRefreshToken, REFRESH_COOKIE_NAME, COOKIE_NAME } from '@/lib/server/auth';
import { GET, POST } from './route';

const COFFRE = REFRESH_COOKIE_NAME.replace(/-refresh$/, '-comptes');

const USERS: Record<string, { tokenVersion: number; status: string; name: string; email: string }> =
  {
    awa: { tokenVersion: 0, status: 'ACTIVE', name: 'Awa', email: 'awa@test.sn' },
    moussa: { tokenVersion: 0, status: 'ACTIVE', name: 'Moussa', email: 'moussa@test.sn' },
    revoque: { tokenVersion: 3, status: 'ACTIVE', name: 'Révoqué', email: 'r@test.sn' },
  };

function req(
  method: 'GET' | 'POST',
  cookies: Record<string, string>,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new NextRequest('http://test/api/auth/comptes', {
    method,
    headers: {
      'content-type': 'application/json',
      cookie: Object.entries(cookies)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('; '),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  prismaMock.user.findMany.mockImplementation((async (args: { where: { id: { in: string[] } } }) =>
    args.where.id.in.filter((id) => USERS[id]).map((id) => ({ id, ...USERS[id]! }))) as never);
});

describe('/api/auth/comptes', () => {
  it('liste le compte actif et les autres, sans les jetons révoqués', async () => {
    const actif = await createRefreshToken('awa', 0);
    const coffre = JSON.stringify([
      await createRefreshToken('moussa', 0),
      await createRefreshToken('revoque', 0), // tokenVersion 0 ≠ 3 en base
      'pas-un-jwt',
    ]);
    const res = await GET(req('GET', { [REFRESH_COOKIE_NAME]: actif, [COFFRE]: coffre }));
    const body = await res.json();
    expect(body.actuel).toMatchObject({ id: 'awa', titre: 'Awa' });
    expect(body.autres.map((c: { id: string }) => c.id)).toEqual(['moussa']);
    // Le coffre est réécrit sans les jetons morts.
    expect(JSON.parse(__cookieStore.get(COFFRE)!.value)).toHaveLength(1);
  });

  it('bascule : le compte choisi devient actif, l’ancien passe au coffre', async () => {
    const actif = await createRefreshToken('awa', 0);
    const coffre = JSON.stringify([await createRefreshToken('moussa', 0)]);
    const res = await POST(
      req(
        'POST',
        { [REFRESH_COOKIE_NAME]: actif, [COFFRE]: coffre },
        {
          action: 'basculer',
          userId: 'moussa',
        },
      ),
    );
    expect(res.status).toBe(200);
    expect(__cookieStore.has(COOKIE_NAME)).toBe(true);

    const nouveauCoffre = JSON.parse(__cookieStore.get(COFFRE)!.value) as string[];
    expect(nouveauCoffre).toHaveLength(1);
    // Ce qui reste au coffre est le jeton d'Awa, plus celui de Moussa.
    const { verifyRefreshToken } = await import('@/lib/server/auth');
    expect((await verifyRefreshToken(nouveauCoffre[0]!))?.sub).toBe('awa');
    expect((await verifyRefreshToken(__cookieStore.get(REFRESH_COOKIE_NAME)!.value))?.sub).toBe(
      'moussa',
    );
  });

  it('refuse de basculer vers un compte absent du coffre, sans toucher aux cookies', async () => {
    const res = await POST(
      req(
        'POST',
        { [REFRESH_COOKIE_NAME]: await createRefreshToken('awa', 0) },
        {
          action: 'basculer',
          userId: 'moussa',
        },
      ),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('COMPTE_INCONNU');
    expect(__cookieStore.has(COOKIE_NAME)).toBe(false);
  });

  it('refuse de basculer vers un compte dont le mot de passe a changé', async () => {
    const coffre = JSON.stringify([await createRefreshToken('revoque', 0)]);
    const res = await POST(
      req('POST', { [COFFRE]: coffre }, { action: 'basculer', userId: 'revoque' }),
    );
    expect(res.status).toBe(404);
  });

  it('ajouter : met le compte actif au coffre et libère la session', async () => {
    const res = await POST(
      req(
        'POST',
        { [REFRESH_COOKIE_NAME]: await createRefreshToken('awa', 0) },
        {
          action: 'ajouter',
        },
      ),
    );
    expect(res.status).toBe(200);
    expect(__cookieStore.get(REFRESH_COOKIE_NAME)?.value).toBe('');
    expect(JSON.parse(__cookieStore.get(COFFRE)!.value)).toHaveLength(1);
  });

  it('ajouter sans session répond 401', async () => {
    const res = await POST(req('POST', {}, { action: 'ajouter' }));
    expect(res.status).toBe(401);
  });

  it('refuse une requête venue d’un autre site quand il n’y a pas de session', async () => {
    const res = await POST(
      req('POST', {}, { action: 'basculer', userId: 'awa' }, { origin: 'https://evil.example' }),
    );
    expect(res.status).toBe(403);
  });
});
