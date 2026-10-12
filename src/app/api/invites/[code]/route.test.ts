import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function makeReq(code: string): { req: NextRequest; ctx: { params: Promise<{ code: string }> } } {
  return {
    req: new NextRequest(`http://test/api/invites/${code}`),
    ctx: { params: Promise.resolve({ code }) },
  };
}

describe('GET /api/invites/[code]', () => {
  it('returns 429 TOO_MANY_INVITE_LOOKUPS once the per-IP limit is exceeded', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      inviteExpiresAt: new Date(Date.now() + 60_000),
      creator: { name: 'Awa' },
    } as never);

    // The limiter is created once at module load with max: 20 — hammer it
    // from a single fixed IP so every request lands in the same bucket.
    const results = [];
    for (let i = 0; i < 21; i++) {
      const req = new NextRequest('http://test/api/invites/123456', {
        headers: { 'x-forwarded-for': '203.0.113.9' },
      });
      results.push(await GET(req, { params: Promise.resolve({ code: '123456' }) }));
    }
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
    const limited = results.find((r) => r.status === 429)!;
    const body = await limited.json();
    expect(body.error).toBe('TOO_MANY_INVITE_LOOKUPS');
  });

  it('returns valid: true with the creator name for a live PENDING invite', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      inviteExpiresAt: new Date(Date.now() + 60_000),
      creator: { name: 'Awa' },
    } as never);
    const { req, ctx } = makeReq('123456');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: true, creatorName: 'Awa' });
  });

  it('returns valid: false, expired: false for an unknown code', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(null);
    const { req, ctx } = makeReq('000000');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: false, expired: false });
  });

  it('returns valid: false, expired: true for an expired invite', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      inviteExpiresAt: new Date(Date.now() - 60_000),
      creator: { name: 'Awa' },
    } as never);
    const { req, ctx } = makeReq('123456');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: false, expired: true });
  });

  it('rejects a malformed code with valid: false, expired: false without hitting the DB', async () => {
    const { req, ctx } = makeReq('abc');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: false, expired: false });
    expect(prismaMock.couple.findFirst).not.toHaveBeenCalled();
  });
});
