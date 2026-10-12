// GET  /api/rituel/question-du-jour — la question d'aujourd'hui, qui a déjà
//      répondu, et — seulement quand les DEUX ont répondu — les réponses.
// POST /api/rituel/question-du-jour — { role, choixPropre, choixDevine }.
//
// LE RÔLE VIENT DU CORPS, PAS DE LA SESSION. Comme dans le jeu, les deux
// partenaires partagent UN appareil authentifié : l'identité de la session ne
// dit pas qui tient le téléphone. Le serveur vérifie seulement que le rôle
// est l'un des deux du couple, et l'index unique (couple, jour, rôle) refuse
// une seconde réponse pour le même rôle. Voir CLAUDE.md, « pass-and-play ».
//
// Le jour est TOUJOURS celui du serveur, jamais celui du client : un client
// ne peut ni répondre à la question de demain, ni rouvrir celle d'hier.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { trouverCoupleRituel, type CoupleRituel } from '@/lib/server/rituel/activite';
import { choisirQuestionDuJour, jourDe } from '@/lib/rituel/jour';
import {
  choixValide,
  estUnRole,
  optionsPubliques,
  revelation,
  type Option,
} from '@/lib/rituel/question-du-jour';

interface QuestionChargee {
  id: string;
  prompt: string;
  options: Option[];
}

/**
 * La question d'aujourd'hui pour ce couple. Si l'un des deux a déjà répondu,
 * c'est SA question qui fait foi — la banque a pu changer depuis.
 */
async function questionDuJour(
  client: PrismaClient,
  coupleId: string,
  jour: string,
  dejaPosee: string | null,
): Promise<QuestionChargee | null> {
  let id = dejaPosee;
  if (!id) {
    // Les questions MIROIR seulement : elles n'ont pas de poids caché, et
    // « répondre pour soi, deviner l'autre » est exactement leur forme.
    const candidates = await client.question.findMany({
      where: { roundType: 'MIROIR', active: true },
      select: { id: true },
    });
    id = choisirQuestionDuJour(
      coupleId,
      jour,
      candidates.map((c) => c.id),
    );
  }
  if (!id) return null;
  const q = await client.question.findUnique({
    where: { id },
    select: { id: true, prompt: true, options: true },
  });
  if (!q) return null;
  return { id: q.id, prompt: q.prompt, options: optionsPubliques(q.options) };
}

function nonTrouve(requestId: string): NextResponse {
  return NextResponse.json(
    { error: 'NO_ACTIVE_COUPLE', message: 'You do not belong to an active Espace Couple.' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}

function pasDeQuestion(requestId: string): NextResponse {
  return NextResponse.json(
    { error: 'NO_DAILY_QUESTION', message: 'The question bank has no MIROIR question.' },
    { status: 503, headers: { 'x-request-id': requestId } },
  );
}

async function etat(couple: CoupleRituel, jour: string) {
  const lignes = await prisma.reponseDuJour.findMany({
    where: { coupleId: couple.id, jour },
    select: { role: true, questionId: true, choixPropre: true, choixDevine: true },
  });
  const question = await questionDuJour(prisma, couple.id, jour, lignes[0]?.questionId ?? null);
  return { lignes, question };
}

function corps(
  couple: CoupleRituel,
  jour: string,
  question: QuestionChargee,
  lignes: Parameters<typeof revelation>[0],
) {
  return {
    jour,
    question: { id: question.id, prompt: question.prompt, options: question.options },
    noms: { CREATOR: couple.creatorName, PARTNER: couple.partnerName },
    ...revelation(lignes),
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const couple = await trouverCoupleRituel(prisma, auth.user.sub);
    if (!couple) return nonTrouve(ctx.requestId);

    const jour = jourDe(new Date());
    const { lignes, question } = await etat(couple, jour);
    if (!question) return pasDeQuestion(ctx.requestId);

    return NextResponse.json(
      {
        ...corps(couple, jour, question, lignes),
        viewerRole: couple.creatorId === auth.user.sub ? 'CREATOR' : 'PARTNER',
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', ctx.requestId);
      return csrfFail;
    }

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const couple = await trouverCoupleRituel(prisma, auth.user.sub);
    if (!couple) return nonTrouve(ctx.requestId);

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const role = body?.role;
    if (!estUnRole(role)) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'role must be CREATOR or PARTNER.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const jour = jourDe(new Date());
    const { lignes, question } = await etat(couple, jour);
    if (!question) return pasDeQuestion(ctx.requestId);

    if (
      !choixValide(question.options, body?.choixPropre) ||
      !choixValide(question.options, body?.choixDevine)
    ) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Both choices must be options of today’s question.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (lignes.some((l) => l.role === role)) {
      return NextResponse.json(
        { error: 'DEJA_REPONDU', message: 'This partner already answered today.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    try {
      await prisma.reponseDuJour.create({
        data: {
          coupleId: couple.id,
          jour,
          questionId: question.id,
          role,
          choixPropre: body.choixPropre as string,
          choixDevine: body.choixDevine as string,
        },
      });
    } catch (err) {
      // Deux envois simultanés pour le même rôle : l'index unique tranche,
      // et le perdant reçoit la même réponse que s'il était arrivé après.
      if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
        return NextResponse.json(
          { error: 'DEJA_REPONDU', message: 'This partner already answered today.' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    const apres = await etat(couple, jour);
    return NextResponse.json(
      {
        ...corps(couple, jour, question, apres.lignes),
        viewerRole: couple.creatorId === auth.user.sub ? 'CREATOR' : 'PARTNER',
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
