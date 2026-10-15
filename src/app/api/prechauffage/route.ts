// GET /api/prechauffage — réveille la base avant le retour de Google.
//
// Le pourquoi et les mesures sont dans lib/auth/prechauffage.ts. Un
// `SELECT 1`, rien d'autre : aucune donnée lue, aucune donnée rendue.
// Publique, comme /api/readyz qui fait déjà la même requête : elle n'ouvre
// donc aucune surface nouvelle. Répond 204 même si la base est injoignable,
// parce qu'un préchauffage raté ne coûte rien et que l'état de la base se
// lit sur /api/readyz, pas ici.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { log } from '@/lib/server/observability/log';

export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    log.warn('prechauffage: base injoignable', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
