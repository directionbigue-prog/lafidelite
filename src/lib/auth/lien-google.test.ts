import { describe, it, expect } from 'vitest';
import { destinationSure, jetonFrais, lienConnexionGoogle, RELAIS_GOOGLE } from './lien-google';

describe('lienConnexionGoogle', () => {
  it('fait passer le retour Google par le relais, destination conservée', () => {
    const lien = lienConnexionGoogle('/jeu');
    expect(lien.startsWith('/api/auth/oauth/google/start?next=')).toBe(true);
    const next = new URL(lien, 'https://x.test').searchParams.get('next')!;
    expect(next).toBe(`${RELAIS_GOOGLE}?next=%2Fjeu`);
    expect(new URL(next, 'https://x.test').searchParams.get('next')).toBe('/jeu');
  });
});

describe('destinationSure', () => {
  it('garde un chemin du site, query comprise', () => {
    expect(destinationSure('/settings')).toBe('/settings');
    expect(destinationSure('/invite/123456?x=1')).toBe('/invite/123456?x=1');
  });

  it('refuse tout ce qui sortirait du site ou bouclerait', () => {
    for (const mauvais of [
      null,
      '',
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/javascript:alert(1)',
      RELAIS_GOOGLE,
      `${RELAIS_GOOGLE}?next=/jeu`,
    ]) {
      expect(destinationSure(mauvais), String(mauvais)).toBe('/jeu');
    }
  });
});

describe('jetonFrais', () => {
  const maintenant = 1_800_000_000_000;
  it('compte un jeton émis à l’instant', () => {
    expect(jetonFrais(maintenant / 1000 - 3, maintenant)).toBe(true);
  });
  it('ne compte pas un jeton ancien, ni une valeur absurde', () => {
    expect(jetonFrais(maintenant / 1000 - 600, maintenant)).toBe(false);
    expect(jetonFrais(undefined, maintenant)).toBe(false);
    expect(jetonFrais('123', maintenant)).toBe(false);
  });
});
