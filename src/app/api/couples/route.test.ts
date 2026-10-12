import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { POST } from './route';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/couples', { method: 'POST' });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = 'https://coeurfidele.test';
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
});

describe('POST /api/couples', () => {
  it('creates a PENDING couple and returns the invite', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(null);
    prismaMock.couple.create.mockResolvedValue({
      id: 'c1',
      inviteCode: '123456',
      inviteExpiresAt: new Date('2026-09-10T00:00:00.000Z'),
    } as never);

    const res = await POST(makeReq());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      id: 'c1',
      code: '123456',
      inviteUrl: 'https://coeurfidele.test/invite/123456',
      expiresAt: '2026-09-10T00:00:00.000Z',
    });
    expect(prismaMock.couple.create).toHaveBeenCalledTimes(1);
    const createArg = prismaMock.couple.create.mock.calls[0]?.[0];
    expect(createArg?.data?.creatorId).toBe('user-1');
    expect(createArg?.data?.status).toBe('PENDING');
  });

  it('returns 409 ALREADY_IN_COUPLE when the user already has an active couple', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({ id: 'existing' } as never);

    const res = await POST(makeReq());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ALREADY_IN_COUPLE');
    expect(prismaMock.couple.create).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    const { NextResponse } = await import('next/server');
    (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns 403 when CSRF verification fails', async () => {
    const { NextResponse } = await import('next/server');
    (verifyCsrf as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect(prismaMock.couple.create).not.toHaveBeenCalled();
  });

  it('retries once on an invite-code collision (P2002) and succeeds', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(null);
    prismaMock.couple.create.mockRejectedValueOnce(p2002(['inviteCode'])).mockResolvedValueOnce({
      id: 'c1',
      inviteCode: '654321',
      inviteExpiresAt: new Date('2026-09-10T00:00:00.000Z'),
    } as never);

    const res = await POST(makeReq());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.code).toBe('654321');
    expect(prismaMock.couple.create).toHaveBeenCalledTimes(2);
  });

  it('returns 409 ALREADY_IN_COUPLE (not 500) when the creator-active partial unique index conflicts', async () => {
    // Simulates two concurrent POST /api/couples from the same user: both
    // pass findActiveCoupleForUser, but the DB-level partial unique index
    // on creatorId catches the loser.
    prismaMock.couple.findFirst.mockResolvedValue(null);
    prismaMock.couple.create.mockRejectedValue(p2002(['creatorId']));

    const res = await POST(makeReq());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ALREADY_IN_COUPLE');
    expect(prismaMock.couple.create).toHaveBeenCalledTimes(1);
  });

  it('returns 503 INVITE_CODE_GENERATION_FAILED when all retries collide', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(null);
    prismaMock.couple.create.mockRejectedValue(p2002(['inviteCode']));

    const res = await POST(makeReq());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('INVITE_CODE_GENERATION_FAILED');
    expect(prismaMock.couple.create).toHaveBeenCalledTimes(5);
  });

  it("source exports runtime = 'nodejs'", async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
  });
});
