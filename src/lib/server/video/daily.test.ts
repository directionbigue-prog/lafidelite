import { afterEach, describe, expect, it, vi } from 'vitest';
import { dailyConfigure, jetonPour, nomDeSalle, salleDuCouple } from './daily';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('daily', () => {
  it('est inerte sans clé', () => {
    vi.stubEnv('DAILY_API_KEY', '');
    expect(dailyConfigure()).toBe(false);
    vi.stubEnv('DAILY_API_KEY', 'k');
    expect(dailyConfigure()).toBe(true);
  });

  it('dérive un nom de salle accepté par Daily', () => {
    expect(nomDeSalle('clx1abc')).toBe('cf-clx1abc');
    expect(nomDeSalle('a/b c')).toBe('cf-abc');
  });

  it('crée la salle PRIVÉE à deux places quand elle n’existe pas encore', async () => {
    vi.stubEnv('DAILY_API_KEY', 'k');
    const appels: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        appels.push({ url, ...(init ? { init } : {}) });
        if (!init?.method) return new Response('{}', { status: 404 });
        return new Response(JSON.stringify({ url: 'https://x.daily.co/cf-c1' }), { status: 200 });
      }),
    );
    expect(await salleDuCouple('c1')).toBe('https://x.daily.co/cf-c1');
    const creation = JSON.parse(String(appels[1]?.init?.body));
    expect(creation.privacy).toBe('private');
    expect(creation.properties.max_participants).toBe(2);
    expect(creation.properties.enable_recording).toBe(false);
    expect((appels[1]?.init?.headers as Record<string, string>).authorization).toBe('Bearer k');
  });

  it('délivre un jeton qui expire et éjecte à expiration', async () => {
    vi.stubEnv('DAILY_API_KEY', 'k');
    let corps: Record<string, Record<string, unknown>> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        corps = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ token: 't' }), { status: 200 });
      }),
    );
    expect(await jetonPour('c1', { id: 'u1', nom: 'Awa' })).toBe('t');
    expect(corps.properties?.room_name).toBe('cf-c1');
    expect(corps.properties?.eject_at_token_exp).toBe(true);
    expect(Number(corps.properties?.exp)).toBeGreaterThan(Date.now() / 1000);
  });
});
