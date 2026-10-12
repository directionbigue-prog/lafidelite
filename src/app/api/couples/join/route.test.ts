import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { POST } from './route';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/couples/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-2', email: 'karim@example.com' },
  });
});

describe('POST /api/couples/join', () => {
  it('joins a PENDING, unexpired couple', async () => {
    prismaMock.couple.findFirst
      .mockResolvedValueOnce(null) // findActiveCoupleForUser(joiner)
      .mockResolvedValueOnce({
        id: 'c1',
        creatorId: 'user-1',
        status: 'PENDING',
        inviteExpiresAt: new Date(Date.now() + 60_000),
        creator: { name: 'Awa' },
      } as never); // the invite lookup
    prismaMock.couple.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: 'c1',
      status: 'ACTIVE',
      partnerName: 'Awa',
      pairedAt: expect.any(String),
    });
    expect(prismaMock.couple.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'PENDING', partnerId: null },
      data: { partnerId: 'user-2', status: 'ACTIVE', pairedAt: expect.any(Date) },
    });
  });

  it('returns 409 INVITE_ALREADY_USED when the race-guarded updateMany matches 0 rows', async () => {
    prismaMock.couple.findFirst
      .mockResolvedValueOnce(null) // findActiveCoupleForUser(joiner)
      .mockResolvedValueOnce({
        id: 'c1',
        creatorId: 'user-1',
        status: 'PENDING',
        inviteExpiresAt: new Date(Date.now() + 60_000),
        creator: { name: 'Awa' },
      } as never); // the invite lookup
    // Simulates a concurrent request having already flipped the row to
    // ACTIVE between our reads and this write.
    prismaMock.couple.updateMany.mockResolvedValue({ count: 0 } as never);

    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('INVITE_ALREADY_USED');
  });

  it('returns 400 VALIDATION_FAILED for a non-6-digit code', async () => {
    const res = await POST(makeReq({ code: 'abc' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('returns 409 ALREADY_IN_COUPLE when the joiner already has a couple', async () => {
    prismaMock.couple.findFirst.mockResolvedValueOnce({ id: 'existing' } as never);
    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ALREADY_IN_COUPLE');
  });

  it('returns 404 INVITE_NOT_FOUND for an unknown code', async () => {
    prismaMock.couple.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const res = await POST(makeReq({ code: '999999' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('INVITE_NOT_FOUND');
  });

  it('returns 410 INVITE_EXPIRED for an expired code', async () => {
    prismaMock.couple.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'c1',
      creatorId: 'user-1',
      status: 'PENDING',
      inviteExpiresAt: new Date(Date.now() - 60_000),
    } as never);
    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe('INVITE_EXPIRED');
  });

  it('returns 409 INVITE_ALREADY_USED when the couple is no longer PENDING', async () => {
    prismaMock.couple.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'c1',
      creatorId: 'user-1',
      status: 'ACTIVE',
      inviteExpiresAt: new Date(Date.now() + 60_000),
    } as never);
    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('INVITE_ALREADY_USED');
  });

  it('returns 400 CANNOT_JOIN_OWN_COUPLE when the creator tries to join their own invite', async () => {
    (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { sub: 'user-1', email: 'awa@example.com' },
    });
    prismaMock.couple.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'c1',
      creatorId: 'user-1',
      status: 'PENDING',
      inviteExpiresAt: new Date(Date.now() + 60_000),
    } as never);
    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('CANNOT_JOIN_OWN_COUPLE');
  });

  it('returns 400 CANNOT_JOIN_OWN_COUPLE (not 410 INVITE_EXPIRED) when own invite is also expired — proves own-check runs before expiry', async () => {
    (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { sub: 'user-1', email: 'awa@example.com' },
    });
    prismaMock.couple.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'c1',
      creatorId: 'user-1',
      status: 'PENDING',
      inviteExpiresAt: new Date(Date.now() - 60_000),
    } as never);
    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('CANNOT_JOIN_OWN_COUPLE');
  });

  it('returns 409 INVITE_ALREADY_USED (not 410 INVITE_EXPIRED) when a used invite is also expired — proves status-check runs before expiry', async () => {
    prismaMock.couple.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'c1',
      creatorId: 'user-1',
      status: 'ACTIVE',
      inviteExpiresAt: new Date(Date.now() - 60_000),
    } as never);
    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('INVITE_ALREADY_USED');
  });

  it('returns 403 when CSRF verification fails', async () => {
    const { NextResponse } = await import('next/server');
    (verifyCsrf as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );
    const res = await POST(makeReq({ code: '123456' }));
    expect(res.status).toBe(403);
    expect(prismaMock.couple.findFirst).not.toHaveBeenCalled();
  });
});
