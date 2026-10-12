import { describe, it, expect, vi } from 'vitest';
import {
  origineDuSite,
  construireAppel,
  executerCron,
  EchecCronPlanifie,
  SOURCES_ORIGINE,
  DELAI_MAX_MS,
} from './appel-planifie';

function reponse(statut: number, corps = ''): Response {
  return new Response(corps, { status: statut });
}

describe('origineDuSite', () => {
  it('préfère APP_URL à tout le reste', () => {
    expect(
      origineDuSite({
        APP_URL: 'https://www.coeurfidele.net',
        URL: 'https://coeurfidele.netlify.app',
      }),
    ).toBe('https://www.coeurfidele.net');
  });

  it('accepte URL, que Netlify pose avec son schéma', () => {
    expect(origineDuSite({ URL: 'https://coeurfidele.netlify.app' })).toBe(
      'https://coeurfidele.netlify.app',
    );
  });

  it('ajoute le schéma à la variable Vercel, qui n’en porte pas', () => {
    expect(origineDuSite({ VERCEL_PROJECT_PRODUCTION_URL: 'coeurfidele.vercel.app' })).toBe(
      'https://coeurfidele.vercel.app',
    );
  });

  it('ne double pas le schéma si la variable en porte un malgré sa convention', () => {
    expect(origineDuSite({ VERCEL_PROJECT_PRODUCTION_URL: 'https://x.vercel.app' })).toBe(
      'https://x.vercel.app',
    );
  });

  it('garde le port quand il y en a un', () => {
    expect(origineDuSite({ APP_URL: 'https://preprod.exemple.net:8443/sous/chemin' })).toBe(
      'https://preprod.exemple.net:8443',
    );
  });

  it('retire la barre finale', () => {
    expect(origineDuSite({ APP_URL: 'https://www.coeurfidele.net/' })).toBe(
      'https://www.coeurfidele.net',
    );
  });

  // Le cas qui compte : un cron qui appelle localhost depuis un Lambda ne
  // tombe pas en erreur, il réussit à ne rien faire. C'est pire qu'un échec.
  it('refuse localhost et passe au candidat suivant', () => {
    expect(
      origineDuSite({ APP_URL: 'http://localhost:3000', URL: 'https://vrai.netlify.app' }),
    ).toBe('https://vrai.netlify.app');
    expect(origineDuSite({ APP_URL: 'http://127.0.0.1:3000' })).toBeNull();
  });

  it('rend null plutôt que de deviner', () => {
    expect(origineDuSite({})).toBeNull();
    expect(origineDuSite({ APP_URL: '   ' })).toBeNull();
    expect(origineDuSite({ APP_URL: 'pas une url' })).toBeNull();
  });

  it('cherche dans l’ordre déclaré, et DEPLOY_PRIME_URL ne passe pas devant URL', () => {
    // Une Deploy Preview doit continuer de parler à elle-même, mais le site
    // principal ne doit jamais être supplanté par une URL de branche.
    expect(SOURCES_ORIGINE.indexOf('URL')).toBeLessThan(
      SOURCES_ORIGINE.indexOf('DEPLOY_PRIME_URL'),
    );
    expect(
      origineDuSite({
        URL: 'https://prod.netlify.app',
        DEPLOY_PRIME_URL: 'https://br.netlify.app',
      }),
    ).toBe('https://prod.netlify.app');
  });
});

describe('construireAppel', () => {
  it('vise /api/cron/<nom> et porte le secret en Bearer', () => {
    const { url, init } = construireAppel('https://x.net', 'outbox-drain', 's3cr3t');
    expect(url).toBe('https://x.net/api/cron/outbox-drain');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer s3cr3t');
  });

  // Les six handlers exportent POST, et GET n'est qu'un alias pour Vercel.
  // Ici c'est nous qui choisissons le verbe, donc on choisit le bon.
  it('emploie POST, le verbe honnête pour une mutation', () => {
    expect(construireAppel('https://x.net', 'outbox-drain', 's').init.method).toBe('POST');
  });

  it('ne produit jamais de double barre', () => {
    expect(construireAppel('https://x.net/', 'a', 's').url).toBe('https://x.net/api/cron/a');
  });
});

describe('executerCron', () => {
  const env = { CRON_SECRET: 'secret-de-test', APP_URL: 'https://x.net' };

  it('rend compte du succès', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponse(200, '{"sent":3}'));
    const r = await executerCron('outbox-drain', { env, fetchImpl: fetchImpl as never });
    expect(r).toEqual({ nom: 'outbox-drain', statut: 200, corps: '{"sent":3}' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://x.net/api/cron/outbox-drain');
  });

  // LA RÈGLE CENTRALE. Un échec doit LEVER, pour que Netlify marque
  // l'invocation en échec et qu'elle soit visible. Retourner 200 en
  // journalisant « ok » est la panne du 02/10 reproduite à l'identique.
  it('lève sur un statut d’échec, en nommant le statut et le corps', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponse(401, '{"error":"UNAUTHORIZED"}'));
    const echec = await executerCron('outbox-drain', {
      env,
      fetchImpl: fetchImpl as never,
    }).catch((e: unknown) => e);

    expect(echec).toBeInstanceOf(EchecCronPlanifie);
    const e = echec as EchecCronPlanifie;
    expect(e.statut).toBe(401);
    expect(e.message).toContain('401');
    expect(e.message).toContain('UNAUTHORIZED');
    expect(e.message).toContain('/api/cron/outbox-drain');
  });

  it('lève aussi sur le 405 qui avait tué les six crons en septembre', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponse(405));
    await expect(
      executerCron('outbox-drain', { env, fetchImpl: fetchImpl as never }),
    ).rejects.toThrow(/405/);
  });

  it('lève sur une panne réseau', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      executerCron('outbox-drain', { env, fetchImpl: fetchImpl as never }),
    ).rejects.toThrow(/ECONNRESET/);
  });

  it('refuse de partir sans CRON_SECRET, et nomme le scope Netlify à vérifier', async () => {
    const fetchImpl = vi.fn();
    const echec = await executerCron('outbox-drain', {
      env: { APP_URL: 'https://x.net' },
      fetchImpl: fetchImpl as never,
    }).catch((e: unknown) => e as EchecCronPlanifie);

    expect((echec as EchecCronPlanifie).message).toContain('CRON_SECRET');
    expect((echec as EchecCronPlanifie).message).toContain('Functions');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuse de partir sans origine, et dit où elle est cherchée', async () => {
    const fetchImpl = vi.fn();
    const echec = await executerCron('outbox-drain', {
      env: { CRON_SECRET: 's' },
      fetchImpl: fetchImpl as never,
    }).catch((e: unknown) => e as EchecCronPlanifie);

    expect((echec as EchecCronPlanifie).message).toContain('APP_URL');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('abandonne avant la limite de 30 s des fonctions planifiées', async () => {
    expect(DELAI_MAX_MS).toBeLessThan(30_000);

    // On vérifie que le signal est bien transmis ET qu'il s'abat : sans la
    // transmission, l'attente irait jusqu'au timeout opaque de Lambda.
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    await expect(
      executerCron('outbox-drain', { env, fetchImpl: fetchImpl as never, delaiMs: 5 }),
    ).rejects.toThrow(/aborted/);
  });

  it('tronque un corps trop long : il part dans un log, pas dans une réponse', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponse(200, 'x'.repeat(2000)));
    const r = await executerCron('outbox-drain', { env, fetchImpl: fetchImpl as never });
    expect(r.corps.length).toBeLessThan(600);
    expect(r.corps.endsWith('…')).toBe(true);
  });
});
