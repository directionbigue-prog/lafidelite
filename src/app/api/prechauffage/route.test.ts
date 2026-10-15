import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/prisma', () => ({
  prisma: { $queryRaw: vi.fn() },
}));

import { GET } from './route';
import { prisma } from '@/lib/server/prisma';

const requete = vi.mocked(prisma.$queryRaw);

// Braces matter: a function returned from `beforeEach` is run by Vitest as
// a teardown, and `mockReset()` returns the mock itself.
beforeEach(() => {
  requete.mockReset();
});

describe('GET /api/prechauffage', () => {
  it('touche la base, puis répond 204 sans cache', async () => {
    requete.mockResolvedValue([{ '?column?': 1 }] as never);
    const res = await GET();
    expect(requete).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(204);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('');
  });

  it('répond 204 même si la base ne répond pas : un préchauffage raté ne coûte rien', async () => {
    requete.mockRejectedValue(new Error('base injoignable') as never);
    const res = await GET();
    expect(res.status).toBe(204);
  });
});
