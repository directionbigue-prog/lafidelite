import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { GET } from './route';
import { requireAuth } from '@/lib/server/middleware';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/questions/categories', { method: 'GET' });
}

const requireAuthMock = requireAuth as unknown as ReturnType<typeof vi.fn>;
// `groupBy` is an overloaded generic on the Prisma client, and
// vitest-mock-extended cannot express its mock type through that overload.
// The cast is at the seam, once, rather than at every call site.
const groupByMock = prismaMock.question.groupBy as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ user: { sub: 'user-1', email: 'awa@example.com' } });
});

describe('GET /api/questions/categories', () => {
  it('reports each category with its round type and question count', async () => {
    groupByMock.mockResolvedValue([
      { roundType: 'SCENARIO', category: 'Confiance & Jalousie', _count: { _all: 5 } },
      { roundType: 'MIROIR', category: 'Communication', _count: { _all: 3 } },
    ] as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      categories: [
        { name: 'Communication', roundType: 'MIROIR', questionCount: 3 },
        { name: 'Confiance & Jalousie', roundType: 'SCENARIO', questionCount: 5 },
      ],
    });
  });

  it('orders by round type then name, so the picker never reshuffles', async () => {
    // `groupBy` guarantees no order. Without the sort the same bank could
    // render in a different sequence on each visit, which reads as a bug
    // to the user even though nothing changed.
    groupByMock.mockResolvedValue([
      { roundType: 'SCENARIO', category: 'Réseaux sociaux', _count: { _all: 4 } },
      { roundType: 'MIROIR', category: 'Quotidien & habitudes', _count: { _all: 4 } },
      { roundType: 'SCENARIO', category: 'Confiance & Jalousie', _count: { _all: 5 } },
      { roundType: 'MIROIR', category: 'Communication', _count: { _all: 3 } },
    ] as never);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.categories.map((c: { name: string }) => c.name)).toEqual([
      'Communication',
      'Quotidien & habitudes',
      'Confiance & Jalousie',
      'Réseaux sociaux',
    ]);
  });

  it('asks only for ACTIVE questions', async () => {
    // A retired question must not keep a theme alive in the picker.
    groupByMock.mockResolvedValue([] as never);
    await GET(makeReq());
    expect(groupByMock).toHaveBeenCalledWith(expect.objectContaining({ where: { active: true } }));
  });

  it('returns an empty list rather than failing when the bank is empty', async () => {
    groupByMock.mockResolvedValue([] as never);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ categories: [] });
  });

  it('requires authentication', async () => {
    requireAuthMock.mockResolvedValue(
      NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }),
    );
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });
});
