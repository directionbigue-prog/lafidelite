import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { PUT } from './route';
import { requireAuth } from '@/lib/server/middleware';
import { positionDepart } from '@/lib/dames/etat';
import { positionDepart as departAwale } from '@/lib/awale/etat';
import { positionDepart as departLudo } from '@/lib/ludo/etat';
import { positionDepart as departMot } from '@/lib/mot/etat';
import { positionDepart as departMotsCroises } from '@/lib/mots-croises/etat';
import { GRILLES } from '@/lib/mots-croises/grilles';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/salon/bg-1/state', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const params = Promise.resolve({ id: 'bg-1' });

beforeEach(() => {
  vi.clearAllMocks();
  (requireAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { sub: 'user-1', email: 'awa@example.com' },
  });
  prismaMock.couple.findFirst.mockResolvedValue({
    id: 'couple-1',
    creatorId: 'user-1',
    partnerId: 'user-2',
  } as never);
  prismaMock.boardGame.findFirst.mockResolvedValue({
    id: 'bg-1',
    coupleId: 'couple-1',
    status: 'IN_PROGRESS',
    kind: 'DAMES',
  } as never);
});

describe('PUT /api/salon/[id]/state — le schéma dépend du jeu', () => {
  // LE défaut que 1 740 tests n'ont pas vu. Cette route validait TOUT état
  // avec `parseEtatPlateau`, le schéma des dames — écrit à l'époque où les
  // dames étaient le seul jeu, et jamais repris quand quatre autres sont
  // arrivés. Un plateau d'Awalé n'a pas la forme d'un damier, donc chaque
  // sauvegarde rendait 400 ; et comme le client sauvegarde en tâche de fond
  // sans attendre la réponse, l'échec était invisible. On jouait, et tout
  // était perdu au rechargement.
  //
  // Aucun test ne l'avait vu parce qu'ils envoyaient tous un plateau de
  // dames. Ceux-ci envoient l'état des quatre autres jeux.
  const autres: readonly [kind: string, etat: () => unknown][] = [
    ['AWALE', () => departAwale()],
    ['LUDO', () => departLudo()],
    ['MOT', () => departMot()],
    ['MOTS_CROISES', () => departMotsCroises(GRILLES[0]?.id ?? '')],
  ];

  for (const [kind, etat] of autres) {
    it(`sauvegarde l’état initial du jeu ${kind}`, async () => {
      prismaMock.boardGame.findFirst.mockResolvedValue({
        id: 'bg-1',
        coupleId: 'couple-1',
        status: 'IN_PROGRESS',
        kind,
      } as never);
      prismaMock.boardGame.updateMany.mockResolvedValue({ count: 1 } as never);
      const res = await PUT(makeReq({ state: etat(), moveCount: 1 }), { params });
      expect(res.status).toBe(200);
      expect(prismaMock.boardGame.updateMany).toHaveBeenCalled();
    });
  }

  it('refuse l’état d’un AUTRE jeu que celui de la partie', () => {
    // Le corollaire : le bon schéma doit aussi refuser ce qui ne le
    // concerne pas. Sans quoi une erreur de `kind` écrirait en base un état
    // qu'aucun moteur ne saurait relire.
    return (async () => {
      prismaMock.boardGame.findFirst.mockResolvedValue({
        id: 'bg-1',
        coupleId: 'couple-1',
        status: 'IN_PROGRESS',
        kind: 'AWALE',
      } as never);
      const res = await PUT(makeReq({ state: positionDepart(), moveCount: 1 }), { params });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('INVALID_STATE');
      expect(prismaMock.boardGame.updateMany).not.toHaveBeenCalled();
    })();
  });

  it('refuse un jeu que ce build ne connaît pas, au lieu de deviner son schéma', async () => {
    prismaMock.boardGame.findFirst.mockResolvedValue({
      id: 'bg-1',
      coupleId: 'couple-1',
      status: 'IN_PROGRESS',
      kind: 'JEU_DU_FUTUR',
    } as never);
    const res = await PUT(makeReq({ state: positionDepart(), moveCount: 1 }), { params });
    expect(res.status).toBe(400);
    expect(prismaMock.boardGame.updateMany).not.toHaveBeenCalled();
  });
});

describe('PUT /api/salon/[id]/state', () => {
  it('sauvegarde un plateau plus avancé', async () => {
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 1 } as never);
    const res = await PUT(makeReq({ state: positionDepart(), moveCount: 5 }), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, moveCount: 5 });
  });

  it('refuse une sauvegarde en retard sans rien écraser', async () => {
    // La garde vit dans le `where` : count === 0 veut dire que la partie
    // enregistrée était déjà plus avancée. C'est le cas d'une requête
    // partie plus tôt et arrivée plus tard.
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 0 } as never);
    const res = await PUT(makeReq({ state: positionDepart(), moveCount: 3 }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('STALE_STATE');
  });

  it('exige un moveCount strictement supérieur dans la requête elle-même', async () => {
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 1 } as never);
    await PUT(makeReq({ state: positionDepart(), moveCount: 5 }), { params });
    const where = prismaMock.boardGame.updateMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ id: 'bg-1', status: 'IN_PROGRESS', moveCount: { lt: 5 } });
  });

  it('emporte le couple jusque dans l’écriture, pas seulement dans la lecture', async () => {
    // Défense en profondeur, pas une faille : `id` est la clé primaire, il
    // vient du segment de route, et rien ne réaffecte un `coupleId`. Mais
    // l'écriture ne doit pas dépendre du `findFirst` qui la précède pour
    // être correcte — c'est ce motif-là qui sera recopié pour le ludo.
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 1 } as never);
    await PUT(makeReq({ state: positionDepart(), moveCount: 5 }), { params });
    const where = prismaMock.boardGame.updateMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ coupleId: 'couple-1' });
  });

  it('refuse un état mal formé', async () => {
    const res = await PUT(makeReq({ state: { cases: [], trait: 'blanc' }, moveCount: 5 }), {
      params,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_STATE');
    expect(prismaMock.boardGame.updateMany).not.toHaveBeenCalled();
  });

  it('refuse un compteur de coups négatif', async () => {
    const res = await PUT(makeReq({ state: positionDepart(), moveCount: -1 }), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_STATE');
    expect(prismaMock.boardGame.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['juste au-dessus du plafond', 100_001],
    ['au bord de l’INTEGER Postgres', 2_147_483_647],
    ['au-delà de l’INTEGER Postgres', 2_147_483_648],
  ])('refuse un compteur de coups %s, sans toucher la base', async (_cas, moveCount) => {
    // `moveCount` atterrit dans une colonne INTEGER. Au-delà de 2^31-1,
    // Postgres refuse la valeur et la route rendait un 500 au lieu d'un
    // 400 ; à 2^31-1 exactement, l'écriture passait et gelait la partie
    // pour toujours — plus aucun compteur ne pouvait lui être strictement
    // supérieur. La borne doit donc mordre AVANT la base.
    const res = await PUT(makeReq({ state: positionDepart(), moveCount }), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_STATE');
    expect(prismaMock.boardGame.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.boardGame.findFirst).not.toHaveBeenCalled();
  });

  it('accepte un compteur de coups au plafond exact', async () => {
    prismaMock.boardGame.updateMany.mockResolvedValue({ count: 1 } as never);
    const res = await PUT(makeReq({ state: positionDepart(), moveCount: 100_000 }), { params });
    expect(res.status).toBe(200);
  });

  it('répond 404, pas 403, pour une partie qui n’est pas celle du couple', async () => {
    // Ne jamais révéler qu'une partie existe chez quelqu'un d'autre —
    // motif déjà établi par requireOrgRole dans ce dépôt.
    prismaMock.boardGame.findFirst.mockResolvedValue(null);
    const res = await PUT(makeReq({ state: positionDepart(), moveCount: 5 }), { params });
    expect(res.status).toBe(404);
  });
});
