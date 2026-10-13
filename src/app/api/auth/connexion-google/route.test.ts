import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { enregistrerConnexion } = vi.hoisted(() => ({ enregistrerConnexion: vi.fn() }));
vi.mock('@/lib/server/admin/connexions', () => ({ enregistrerConnexion }));
vi.mock('@/lib/server/redis', () => ({ redis: null }));

import { createAccessToken, COOKIE_NAME } from '@/lib/server/auth';
import { GET } from './route';

function req(next: string, jeton?: string) {
  return new NextRequest(
    `https://coeurfidele.test/api/auth/connexion-google?next=${encodeURIComponent(next)}`,
    {
      headers: jeton ? { cookie: `${COOKIE_NAME}=${jeton}` } : {},
    },
  );
}

beforeEach(() => enregistrerConnexion.mockReset());

describe('GET /api/auth/connexion-google', () => {
  it('compte une connexion Google fraîche puis redirige vers la destination', async () => {
    const jeton = await createAccessToken({ sub: 'u1', email: 'a@b.sn', tokenVersion: 0 });
    const res = await GET(req('/jeu', jeton));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://coeurfidele.test/jeu');
    expect(enregistrerConnexion).toHaveBeenCalledWith(
      expect.objectContaining({ methode: 'GOOGLE', userId: 'u1' }),
    );
  });

  it('sans session, ne compte rien mais redirige quand même', async () => {
    const res = await GET(req('/settings'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://coeurfidele.test/settings');
    expect(enregistrerConnexion).not.toHaveBeenCalled();
  });

  it('ne redirige jamais hors du site', async () => {
    const res = await GET(req('//evil.example/x'));
    expect(res.headers.get('location')).toBe('https://coeurfidele.test/jeu');
  });
});
