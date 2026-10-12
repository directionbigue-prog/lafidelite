import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { findActiveCoupleForUser, findActivatedCoupleForUser } from './queries';

describe('findActiveCoupleForUser', () => {
  it('queries for PENDING/ACTIVE couples where the user is creator or partner', async () => {
    prismaMock.couple.findFirst.mockResolvedValue({ id: 'c1' } as never);
    const result = await findActiveCoupleForUser(prismaMock, 'user-1');
    expect(result).toEqual({ id: 'c1' });
    expect(prismaMock.couple.findFirst).toHaveBeenCalledWith({
      where: {
        status: { in: ['PENDING', 'ACTIVE'] },
        OR: [{ creatorId: 'user-1' }, { partnerId: 'user-1' }],
      },
      select: { id: true },
    });
  });

  it('returns null when the user has no active couple', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(null);
    const result = await findActiveCoupleForUser(prismaMock, 'user-2');
    expect(result).toBeNull();
  });
});

describe('findActivatedCoupleForUser', () => {
  it('returns the couple when status is ACTIVE and the user is the creator', async () => {
    const couple = {
      id: 'c1',
      creatorId: 'user-1',
      partnerId: 'user-2',
      disclaimerAcceptedByCreatorAt: new Date('2026-01-01T00:00:00Z'),
      disclaimerAcceptedByPartnerAt: new Date('2026-01-02T00:00:00Z'),
      cumulativeCoupleScore: 42,
    };
    prismaMock.couple.findFirst.mockResolvedValue(couple as never);
    const result = await findActivatedCoupleForUser(prismaMock, 'user-1');
    expect(result).toEqual(couple);
    expect(prismaMock.couple.findFirst).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        OR: [{ creatorId: 'user-1' }, { partnerId: 'user-1' }],
      },
      select: {
        id: true,
        creatorId: true,
        partnerId: true,
        disclaimerAcceptedByCreatorAt: true,
        disclaimerAcceptedByPartnerAt: true,
        cumulativeCoupleScore: true,
      },
    });
  });

  it('returns the couple when status is ACTIVE and the user is the partner', async () => {
    const couple = {
      id: 'c2',
      creatorId: 'user-1',
      partnerId: 'user-2',
      disclaimerAcceptedByCreatorAt: null,
      disclaimerAcceptedByPartnerAt: null,
      cumulativeCoupleScore: 0,
    };
    prismaMock.couple.findFirst.mockResolvedValue(couple as never);
    const result = await findActivatedCoupleForUser(prismaMock, 'user-2');
    expect(result).toEqual(couple);
  });

  it('issues a where clause scoped to status ACTIVE only, which a PENDING couple can never match (unlike findActiveCoupleForUser)', async () => {
    // prismaMock does no real filtering — it just returns whatever we tell
    // it to — so this test cannot demonstrate PENDING-exclusion by mocking
    // a resolved value. Instead it asserts the query SHAPE itself: the
    // where-clause uses the plain string 'ACTIVE', not the
    // `{ in: ['PENDING', 'ACTIVE'] }` range that findActiveCoupleForUser
    // uses above. A PENDING row can only satisfy `{ in: [...] }`, never a
    // plain-string equality against 'ACTIVE' — so by construction, this
    // query excludes PENDING couples in a real database.
    prismaMock.couple.findFirst.mockResolvedValue(null);
    await findActivatedCoupleForUser(prismaMock, 'user-1');
    const call = prismaMock.couple.findFirst.mock.calls[0]?.[0];
    expect(call?.where).toEqual({
      status: 'ACTIVE',
      OR: [{ creatorId: 'user-1' }, { partnerId: 'user-1' }],
    });
    expect(call?.where?.status).not.toEqual({ in: ['PENDING', 'ACTIVE'] });
  });

  it('returns null when the user has no couple at all', async () => {
    prismaMock.couple.findFirst.mockResolvedValue(null);
    const result = await findActivatedCoupleForUser(prismaMock, 'user-3');
    expect(result).toBeNull();
  });
});
