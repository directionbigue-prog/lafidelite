import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INTERVALLE_PRECHAUFFAGE_MS,
  ROUTE_PRECHAUFFAGE,
  _reinitialiserPrechauffage,
  prechaufferServeur,
} from './prechauffage';

afterEach(() => _reinitialiserPrechauffage());

describe('prechaufferServeur', () => {
  it('envoie une requête sans cookie, qui survit au changement de page', () => {
    const envoyer = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    expect(prechaufferServeur(1_000, envoyer)).toBe(true);
    expect(envoyer).toHaveBeenCalledTimes(1);
    const [url, init] = envoyer.mock.calls[0]!;
    expect(url).toBe(ROUTE_PRECHAUFFAGE);
    expect(init).toMatchObject({ keepalive: true, credentials: 'omit', cache: 'no-store' });
  });

  it("ne renvoie rien tant que la base vient d'être réveillée", () => {
    const envoyer = vi.fn().mockResolvedValue(undefined);
    prechaufferServeur(1_000, envoyer);
    expect(prechaufferServeur(1_000 + INTERVALLE_PRECHAUFFAGE_MS - 1, envoyer)).toBe(false);
    expect(envoyer).toHaveBeenCalledTimes(1);
  });

  it("réveille de nouveau une fois l'intervalle écoulé", () => {
    const envoyer = vi.fn().mockResolvedValue(undefined);
    prechaufferServeur(1_000, envoyer);
    expect(prechaufferServeur(1_000 + INTERVALLE_PRECHAUFFAGE_MS, envoyer)).toBe(true);
    expect(envoyer).toHaveBeenCalledTimes(2);
  });

  it('reste sous la mise en veille de Neon (5 min)', () => {
    expect(INTERVALLE_PRECHAUFFAGE_MS).toBeLessThan(5 * 60_000);
  });

  it("n'échoue jamais : ni rejet non géré, ni exception", async () => {
    const rejet = vi.fn().mockRejectedValue(new Error('réseau'));
    expect(() => prechaufferServeur(1_000, rejet)).not.toThrow();
    await Promise.resolve();

    _reinitialiserPrechauffage();
    const jette = vi.fn(() => {
      throw new TypeError('fetch indisponible');
    });
    expect(() => prechaufferServeur(1_000, jette)).not.toThrow();
  });
});
