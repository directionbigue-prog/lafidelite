import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { estAdresseInvite } from '@/lib/couples/compte-invite';

mockNextCookies();

import { POST } from './route';

let ip = 0;
function call(code: string, body: unknown, headers: Record<string, string> = {}) {
  // A fresh IP per call keeps the per-IP limiter out of tests that are not about it.
  ip += 1;
  const req = new NextRequest(`http://test/api/invites/${code}/accept`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `198.51.100.${ip % 250}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ code }) });
}

const PENDING = {
  id: 'c1',
  status: 'PENDING',
  partnerId: null,
  inviteExpiresAt: new Date(Date.now() + 60_000),
  creator: { name: 'Awa' },
};

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  prismaMock.$transaction.mockImplementation(
    (cb: unknown) => (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>,
  );
  prismaMock.user.create.mockImplementation((async ({ data }: { data: { email: string } }) => ({
    id: 'u2',
    email: data.email,
    tokenVersion: 0,
  })) as never);
});

describe('POST /api/invites/[code]/accept', () => {
  it('crée le compte invité, active le couple et ouvre la session', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(PENDING as never);
    prismaMock.couple.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await call('123456', { name: '  Moussa ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, user: { sub: 'u2' }, partnerName: 'Awa' });

    const data = prismaMock.user.create.mock.calls[0]![0].data;
    expect(data.name).toBe('Moussa');
    expect(estAdresseInvite(data.email)).toBe(true);
    expect(data).not.toHaveProperty('passwordHash');

    expect(prismaMock.couple.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'PENDING', partnerId: null },
      data: expect.objectContaining({ partnerId: 'u2', status: 'ACTIVE' }),
    });
    expect(__cookieStore.size()).toBeGreaterThanOrEqual(3);
  });

  it('refuse un code inconnu sans créer de compte', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(null);
    const res = await call('000000', { name: 'Moussa' });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('INVITE_NOT_FOUND');
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(__cookieStore.size()).toBe(0);
  });

  it('refuse une invitation expirée', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      ...PENDING,
      inviteExpiresAt: new Date(Date.now() - 1000),
    } as never);
    const res = await call('123456', { name: 'Moussa' });
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe('INVITE_EXPIRED');
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('refuse une invitation déjà utilisée', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      ...PENDING,
      status: 'ACTIVE',
      partnerId: 'u9',
    } as never);
    const res = await call('123456', { name: 'Moussa' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('INVITE_ALREADY_USED');
  });

  it('perd la course proprement : 409, aucune session ouverte', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(PENDING as never);
    prismaMock.couple.updateMany.mockResolvedValue({ count: 0 } as never);
    const res = await call('123456', { name: 'Moussa' });
    expect(res.status).toBe(409);
    expect(__cookieStore.size()).toBe(0);
  });

  it('refuse un prénom vide ou un code mal formé', async () => {
    expect((await call('123456', { name: '   ' })).status).toBe(400);
    expect((await call('abc', { name: 'Moussa' })).status).toBe(400);
    expect(prismaMock.couple.findFirst).not.toHaveBeenCalled();
  });

  it('refuse une requête venue d’un autre site', async () => {
    const res = await call('123456', { name: 'Moussa' }, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(prismaMock.couple.findFirst).not.toHaveBeenCalled();
  });

  it('accepte une requête de la même origine', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(PENDING as never);
    prismaMock.couple.updateMany.mockResolvedValue({ count: 1 } as never);
    const res = await call('123456', { name: 'Moussa' }, { origin: 'http://test' });
    expect(res.status).toBe(200);
  });
});
