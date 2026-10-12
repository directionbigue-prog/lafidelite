// Tests de la sonde de disponibilité.
//
// Écrits le 02/10/2026, le jour où l'endpoint a répondu `{"ok":true}` en
// production pendant qu'on cherchait pourquoi aucun mail de vérification
// n'arrivait. Il sondait la base et Redis — les deux seules choses qui
// allaient bien — et ne disait rien de la chaîne mail. Le diagnostic a dû se
// faire en déclenchant les crons et en lisant la base à la main.
//
// Les deux assertions qui comptent ici sont des assertions de CONTRAT :
//   1. l'état du mail est rapporté ;
//   2. il ne fait PAS tomber la sonde en 503, parce que ce code pilote le
//      routage du trafic et qu'une application sans mail sert encore le jeu,
//      le Salon et toutes les lectures.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/server/prisma', () => ({
  prisma: { $queryRawUnsafe: vi.fn().mockResolvedValue([{ '?column?': 1 }]) },
}));
vi.mock('@/lib/server/redis', () => ({ redis: { ping: vi.fn().mockResolvedValue('PONG') } }));
vi.mock('@/lib/server/queues/email-queue-singleton', () => ({ getEmailQueue: vi.fn() }));

import { GET } from './route';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';

const mockQueue = vi.mocked(getEmailQueue);

const ORIG = {
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
  key: process.env.RESEND_API_KEY,
  from: process.env.EMAIL_FROM,
};

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://exemple.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'jeton';
  process.env.RESEND_API_KEY = 're_test';
  process.env.EMAIL_FROM = 'Test <bonjour@exemple.test>';
});

afterEach(() => {
  for (const [nom, valeur] of [
    ['UPSTASH_REDIS_REST_URL', ORIG.url],
    ['UPSTASH_REDIS_REST_TOKEN', ORIG.token],
    ['RESEND_API_KEY', ORIG.key],
    ['EMAIL_FROM', ORIG.from],
  ] as const) {
    if (valeur === undefined) delete process.env[nom];
    else process.env[nom] = valeur;
  }
  vi.clearAllMocks();
});

describe('GET /api/readyz', () => {
  it('sonde la base et Redis, et répond 200 quand les deux répondent', async () => {
    mockQueue.mockReturnValue({} as never);
    const res = await GET();
    const corps = await res.json();
    expect(res.status).toBe(200);
    expect(corps.ok).toBe(true);
    expect(corps.checks.database.ok).toBe(true);
    expect(corps.checks.redis.ok).toBe(true);
  });

  it('rapporte la chaîne mail comme configurée', async () => {
    mockQueue.mockReturnValue({} as never);
    const corps = await (await GET()).json();
    expect(corps.email.configured).toBe(true);
    expect(corps.email.missing).toEqual([]);
  });

  // L'assertion centrale.
  it('ne tombe PAS en 503 quand le mail est inconfigurable', async () => {
    mockQueue.mockReturnValue(null);
    delete process.env.RESEND_API_KEY;
    const res = await GET();
    const corps = await res.json();
    expect(res.status, 'un fournisseur de mail absent ne doit pas sortir l’app du routage').toBe(
      200,
    );
    expect(corps.ok).toBe(true);
    expect(corps.email.configured).toBe(false);
  });

  it('nomme les variables manquantes, et seulement leurs noms', async () => {
    mockQueue.mockReturnValue(null);
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    const corps = await (await GET()).json();
    expect(corps.email.missing).toEqual(['RESEND_API_KEY', 'EMAIL_FROM']);
  });

  it('ne divulgue aucune valeur de secret dans la réponse', async () => {
    // Une sonde de disponibilité est publique : elle ne doit jamais rendre
    // lisible ce qu'elle vérifie.
    mockQueue.mockReturnValue({} as never);
    const brut = JSON.stringify(await (await GET()).json());
    expect(brut).not.toContain('re_test');
    expect(brut).not.toContain('jeton');
    expect(brut).not.toContain('bonjour@exemple.test');
    expect(brut).not.toContain('exemple.upstash.io');
  });
});
