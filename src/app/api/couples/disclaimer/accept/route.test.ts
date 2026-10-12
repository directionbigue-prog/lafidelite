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

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/couples/disclaimer/accept', { method: 'POST' });
}

beforeEach(() => {
  vi.clearAllMocks();
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
});

describe('POST /api/couples/disclaimer/accept', () => {
  it('records the creator acceptance and returns both flags', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      id: 'c1',
      creatorId: 'user-1',
      partnerId: 'user-2',
    } as never);
    prismaMock.couple.update.mockResolvedValue({
      disclaimerAcceptedByCreatorAt: new Date('2026-09-03T00:00:00.000Z'),
      disclaimerAcceptedByPartnerAt: null,
    } as never);

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ acceptedByCreator: true, acceptedByPartner: false });
    expect(prismaMock.couple.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { disclaimerAcceptedByCreatorAt: expect.any(Date) },
      select: { disclaimerAcceptedByCreatorAt: true, disclaimerAcceptedByPartnerAt: true },
    });
  });

  it('records the partner acceptance and returns both flags', async () => {
    (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { sub: 'user-2', email: 'karim@example.com' },
    });
    prismaMock.couple.findFirst.mockResolvedValue({
      id: 'c1',
      creatorId: 'user-1',
      partnerId: 'user-2',
    } as never);
    prismaMock.couple.update.mockResolvedValue({
      disclaimerAcceptedByCreatorAt: new Date('2026-09-03T00:00:00.000Z'),
      disclaimerAcceptedByPartnerAt: new Date('2026-09-03T00:05:00.000Z'),
    } as never);

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ acceptedByCreator: true, acceptedByPartner: true });
    expect(prismaMock.couple.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { disclaimerAcceptedByPartnerAt: expect.any(Date) },
      select: { disclaimerAcceptedByCreatorAt: true, disclaimerAcceptedByPartnerAt: true },
    });
  });

  it('returns 404 NO_ACTIVE_COUPLE when the caller has no PENDING/ACTIVE couple', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(null);

    const res = await POST(makeReq());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('NO_ACTIVE_COUPLE');
    expect(prismaMock.couple.update).not.toHaveBeenCalled();
  });

  it('returns 403 when CSRF verification fails', async () => {
    const { NextResponse } = await import('next/server');
    (verifyCsrf as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect(prismaMock.couple.findFirst).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    const { NextResponse } = await import('next/server');
    (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(prismaMock.couple.findFirst).not.toHaveBeenCalled();
  });

  it("source exports runtime = 'nodejs'", async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
  });
});
