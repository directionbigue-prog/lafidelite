import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const req = () => new NextRequest('http://test/api/video/jeton');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.sn' } } as never);
  vi.stubEnv('DAILY_API_KEY', 'cle-de-test');
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/video/jeton — disponibilité du bouton', () => {
  it('disponible pour un membre d’un couple actif avec partenaire', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({ id: 'c1', partnerId: 'u2' } as never);
    expect(await (await GET(req())).json()).toEqual({ disponible: true });
  });

  it('indisponible sans couple actif : il n’y a personne à appeler', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(null);
    expect(await (await GET(req())).json()).toEqual({ disponible: false });
  });

  it('indisponible sans clé Daily, sans même interroger la base', async () => {
    vi.stubEnv('DAILY_API_KEY', '');
    expect(await (await GET(req())).json()).toEqual({ disponible: false });
    expect(prismaMock.couple.findFirst).not.toHaveBeenCalled();
  });
});
