import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import fg from 'fast-glob';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

describe('apiAdmin', () => {
  it('appelle la ROUTE /api/admin/…, pas la page /admin/…', async () => {
    const { apiAdmin } = await import('./api-admin');
    await apiAdmin('/admin/me');
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url.endsWith('/api/admin/me')).toBe(true);
  });
});

describe('aucun écran d’administration n’appelle api() directement', () => {
  // Le défaut d'origine : `api('/admin/me')` demandait la page, pas la route,
  // et la console entière affichait une erreur en production.
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const fichiers = fg.sync(['app/admin/**/*.tsx', 'components/admin/**/*.tsx'], {
    cwd: SRC,
    absolute: true,
  });

  it('il y a bien des écrans à vérifier', () => {
    expect(fichiers.length).toBeGreaterThanOrEqual(5);
  });

  for (const f of fichiers) {
    it(f.slice(SRC.length + 1), () => {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/(?<![A-Za-z])api(<[^(]*>)?\(/);
    });
  }
});
