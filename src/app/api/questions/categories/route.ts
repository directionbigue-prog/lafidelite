// GET /api/questions/categories — what the question bank actually contains.
//
// The theme picker (planche 02 web / 03 mobile) needs to offer themes, and
// the one thing it must never do is offer a theme with nothing behind it:
// a couple who picks "Ex et passé" and is then asked about something else
// has been lied to by the screen. So this endpoint reports the bank as it
// is — every active category, which round type it belongs to, and how many
// questions it holds — rather than a curated list a screen could drift from.
//
// The count is load-bearing, not decoration. Categories in this bank are
// scoped PER ROUND TYPE, and a round draws a fixed number of questions, so
// whether a theme can actually shape a round depends on how many questions
// it has for that round. `narrowToCategories` enforces that server-side;
// this lets the screen tell the truth about it beforehand.
//
// Public-ish but still authenticated: the bank is product content, and
// there is no reason for it to be readable without an account.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const rows = await prisma.question.groupBy({
      by: ['roundType', 'category'],
      where: { active: true },
      _count: { _all: true },
    });

    // Sorted here rather than left to the database: `groupBy` gives no
    // stable order, and a picker whose themes reshuffle between visits
    // looks broken even though nothing changed.
    const categories = rows
      .map((row) => ({
        name: row.category,
        roundType: row.roundType,
        questionCount: row._count._all,
      }))
      .sort((a, b) => a.roundType.localeCompare(b.roundType) || a.name.localeCompare(b.name));

    return NextResponse.json(
      { categories },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
