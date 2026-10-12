import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { GET } from './route';
import { requireAuth } from '@/lib/server/middleware';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/couples/me', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = 'https://coeurfidele.test';
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
});

describe('GET /api/couples/me', () => {
  it('returns { couple: null } when the user has no couple', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ couple: null });
  });

  it('returns PENDING with the invite when the user is the creator awaiting a partner', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      status: 'PENDING',
      creatorId: 'user-1',
      partnerId: null,
      inviteCode: '123456',
      inviteExpiresAt: new Date('2026-09-10T00:00:00.000Z'),
      pairedAt: null,
      creator: { name: 'Awa' },
      partner: null,
    } as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      couple: {
        status: 'PENDING',
        code: '123456',
        inviteUrl: 'https://coeurfidele.test/invite/123456',
        expiresAt: '2026-09-10T00:00:00.000Z',
      },
    });
  });

  it('returns ACTIVE with the other partner name when paired, before either accepts the disclaimer', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      status: 'ACTIVE',
      creatorId: 'user-1',
      partnerId: 'user-2',
      inviteCode: '123456',
      inviteExpiresAt: new Date('2026-09-10T00:00:00.000Z'),
      pairedAt: new Date('2026-09-04T00:00:00.000Z'),
      disclaimerAcceptedByCreatorAt: null,
      disclaimerAcceptedByPartnerAt: null,
      cumulativeCoupleScore: 0,
      creator: { name: 'Awa' },
      partner: { name: 'Karim' },
      _count: { gameSessions: 0 },
    } as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      couple: {
        status: 'ACTIVE',
        partnerName: 'Karim',
        viewerRole: 'CREATOR',
        pairedAt: '2026-09-04T00:00:00.000Z',
        disclaimerAcceptedByCreator: false,
        disclaimerAcceptedByPartner: false,
        // The couple's standing, for /jeu's start screen. The AGGREGATE
        // only — never a past answer, which the product never lets either
        // partner reopen.
        cumulativeCoupleScore: 0,
        complicityLevel: 'DECOUVERTE',
        // Zero here because this couple has never finished a game — the
        // count is COMPLETED-only.
        gamesPlayed: 0,
      },
    });
  });

  it('derives the complicity level from the cumulative score', async () => {
    (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { sub: 'user-1', email: 'awa@example.com' },
    });
    prismaMock.couple.findFirst.mockResolvedValue({
      status: 'ACTIVE',
      creatorId: 'user-1',
      partnerId: 'user-2',
      inviteCode: '123456',
      inviteExpiresAt: new Date('2026-09-10T00:00:00.000Z'),
      pairedAt: new Date('2026-09-04T00:00:00.000Z'),
      disclaimerAcceptedByCreatorAt: null,
      disclaimerAcceptedByPartnerAt: null,
      cumulativeCoupleScore: 340,
      creator: { name: 'Awa' },
      partner: { name: 'Karim' },
      _count: { gameSessions: 0 },
    } as never);

    const body = await (await GET(makeReq())).json();
    // 340 sits in the FUSIONNELS band (300+). Computed server-side from
    // the scoring engine's own thresholds so the start screen never
    // carries a second copy of that table.
    expect(body.couple.complicityLevel).toBe('FUSIONNELS');
    expect(body.couple.cumulativeCoupleScore).toBe(340);
  });

  it('shows the creator name when the CURRENT user is the partner', async () => {
    (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { sub: 'user-2', email: 'karim@example.com' },
    });
    prismaMock.couple.findFirst.mockResolvedValue({
      status: 'ACTIVE',
      creatorId: 'user-1',
      partnerId: 'user-2',
      inviteCode: '123456',
      inviteExpiresAt: new Date('2026-09-10T00:00:00.000Z'),
      pairedAt: new Date('2026-09-04T00:00:00.000Z'),
      disclaimerAcceptedByCreatorAt: null,
      disclaimerAcceptedByPartnerAt: null,
      creator: { name: 'Awa' },
      partner: { name: 'Karim' },
      _count: { gameSessions: 0 },
    } as never);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.couple.partnerName).toBe('Awa');
  });

  it('reports disclaimerAcceptedByCreator=true only once the creator has actually accepted (timestamp non-null)', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      status: 'ACTIVE',
      creatorId: 'user-1',
      partnerId: 'user-2',
      inviteCode: '123456',
      inviteExpiresAt: new Date('2026-09-10T00:00:00.000Z'),
      pairedAt: new Date('2026-09-04T00:00:00.000Z'),
      disclaimerAcceptedByCreatorAt: new Date('2026-09-04T01:00:00.000Z'),
      disclaimerAcceptedByPartnerAt: null,
      creator: { name: 'Awa' },
      partner: { name: 'Karim' },
      _count: { gameSessions: 0 },
    } as never);

    const res = await GET(makeReq());
    const body = await res.json();
    // Exact-value, not a truthiness check: this pins that a lone creator
    // acceptance never flips the PARTNER's flag too — the two must stay
    // independent so /jeu's needsDisclaimerGate can require both.
    expect(body.couple.disclaimerAcceptedByCreator).toBe(true);
    expect(body.couple.disclaimerAcceptedByPartner).toBe(false);
  });

  it('reports both disclaimer flags true once both partners have accepted', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      status: 'ACTIVE',
      creatorId: 'user-1',
      partnerId: 'user-2',
      inviteCode: '123456',
      inviteExpiresAt: new Date('2026-09-10T00:00:00.000Z'),
      pairedAt: new Date('2026-09-04T00:00:00.000Z'),
      disclaimerAcceptedByCreatorAt: new Date('2026-09-04T01:00:00.000Z'),
      disclaimerAcceptedByPartnerAt: new Date('2026-09-04T02:00:00.000Z'),
      creator: { name: 'Awa' },
      partner: { name: 'Karim' },
      _count: { gameSessions: 0 },
    } as never);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.couple.disclaimerAcceptedByCreator).toBe(true);
    expect(body.couple.disclaimerAcceptedByPartner).toBe(true);
  });

  it('never leaks the raw acceptance timestamps, only the derived booleans', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      status: 'ACTIVE',
      creatorId: 'user-1',
      partnerId: 'user-2',
      inviteCode: '123456',
      inviteExpiresAt: new Date('2026-09-10T00:00:00.000Z'),
      pairedAt: new Date('2026-09-04T00:00:00.000Z'),
      disclaimerAcceptedByCreatorAt: new Date('2026-09-04T01:00:00.000Z'),
      disclaimerAcceptedByPartnerAt: new Date('2026-09-04T02:00:00.000Z'),
      cumulativeCoupleScore: 120,
      creator: { name: 'Awa' },
      partner: { name: 'Karim' },
      _count: { gameSessions: 0 },
    } as never);

    const res = await GET(makeReq());
    const body = await res.json();
    // An exact key set, not a subset: this is the guard that the response
    // carries no raw timestamp and nothing else that was never meant to
    // leave the server. Every field added here has to be justified, which
    // is the point — `cumulativeCoupleScore` and `complicityLevel` are the
    // couple's AGGREGATE standing, never an individual past answer.
    expect(Object.keys(body.couple).sort()).toEqual([
      'complicityLevel',
      'cumulativeCoupleScore',
      'disclaimerAcceptedByCreator',
      'disclaimerAcceptedByPartner',
      'gamesPlayed',
      'pairedAt',
      'partnerName',
      'status',
      'viewerRole',
    ]);
  });

  it('counts only COMPLETED games, scoped to this couple', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      id: 'couple-1',
      status: 'ACTIVE',
      creatorId: 'user-1',
      partnerId: 'user-2',
      inviteCode: '123456',
      inviteExpiresAt: new Date('2026-09-10T00:00:00.000Z'),
      pairedAt: new Date('2026-09-04T00:00:00.000Z'),
      disclaimerAcceptedByCreatorAt: new Date('2026-09-04T01:00:00.000Z'),
      disclaimerAcceptedByPartnerAt: new Date('2026-09-04T02:00:00.000Z'),
      cumulativeCoupleScore: 120,
      creator: { name: 'Awa' },
      partner: { name: 'Karim' },
      _count: { gameSessions: 7 },
    } as never);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.couple.gamesPlayed).toBe(7);

    // The count rides along in the couple query rather than following it.
    // As a second call it could only run once this one returned, and a
    // second sequential round-trip to Postgres is worth ~1s on the app's
    // most-visited screen — measured, not assumed.
    expect(prismaMock.gameSession.count).not.toHaveBeenCalled();

    // The filter is the whole point of the field. Counting every session
    // would include abandoned and in-progress ones.
    const select = prismaMock.couple.findFirst.mock.calls[0]?.[0]?.select as
      | { _count?: { select?: { gameSessions?: { where?: unknown } } } }
      | undefined;
    expect(select?._count?.select?.gameSessions?.where).toEqual({ status: 'COMPLETED' });
  });

  // viewerRole tells the pass-and-play screens which side of the couple
  // the caller is, so they can turn the session's `activePlayerRole` into
  // a person ("à toi de jouer" vs "passe le téléphone à Karim").
  it('reports viewerRole CREATOR when the caller created the couple', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      status: 'ACTIVE',
      creatorId: 'user-1',
      partnerId: 'user-2',
      inviteCode: '123456',
      inviteExpiresAt: new Date('2026-09-10T00:00:00.000Z'),
      pairedAt: new Date('2026-09-04T00:00:00.000Z'),
      disclaimerAcceptedByCreatorAt: null,
      disclaimerAcceptedByPartnerAt: null,
      creator: { name: 'Awa' },
      partner: { name: 'Karim' },
      _count: { gameSessions: 0 },
    } as never);

    const body = await (await GET(makeReq())).json();
    expect(body.couple.viewerRole).toBe('CREATOR');
    expect(body.couple.partnerName).toBe('Karim');
  });

  it('reports viewerRole PARTNER when the caller joined the couple', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({
      status: 'ACTIVE',
      creatorId: 'user-2',
      partnerId: 'user-1',
      inviteCode: '123456',
      inviteExpiresAt: new Date('2026-09-10T00:00:00.000Z'),
      pairedAt: new Date('2026-09-04T00:00:00.000Z'),
      disclaimerAcceptedByCreatorAt: null,
      disclaimerAcceptedByPartnerAt: null,
      creator: { name: 'Awa' },
      partner: { name: 'Karim' },
      _count: { gameSessions: 0 },
    } as never);

    const body = await (await GET(makeReq())).json();
    expect(body.couple.viewerRole).toBe('PARTNER');
    // …and the "other person" flips accordingly.
    expect(body.couple.partnerName).toBe('Awa');
  });
});
