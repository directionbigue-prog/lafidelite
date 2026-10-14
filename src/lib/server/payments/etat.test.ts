import { describe, expect, it } from 'vitest';
import { alertesPaiement, etatPaiement, etatUrlPublique, urlPubliqueNettoyee } from './etat';

describe('urlPubliqueNettoyee', () => {
  it('retire le BOM, les espaces et la barre finale', () => {
    expect(urlPubliqueNettoyee('\uFEFFhttps://www.coeurfidele.net/ ')).toBe(
      'https://www.coeurfidele.net',
    );
  });

  it('rend undefined pour une valeur vide', () => {
    expect(urlPubliqueNettoyee(undefined)).toBeUndefined();
    expect(urlPubliqueNettoyee('  ')).toBeUndefined();
  });
});

describe('etatUrlPublique', () => {
  it('exige https en production', () => {
    expect(etatUrlPublique('https://www.coeurfidele.net', true)).toBe('ok');
    expect(etatUrlPublique('http://www.coeurfidele.net', true)).toBe('invalide');
    expect(etatUrlPublique('http://localhost:3000', false)).toBe('ok');
  });

  it('dit absente ou invalide', () => {
    expect(etatUrlPublique(undefined, true)).toBe('absente');
    expect(etatUrlPublique('www.coeurfidele.net', true)).toBe('invalide');
  });
});

describe('etatPaiement', () => {
  const cles = { PAYTECH_API_KEY: 'k', PAYTECH_API_SECRET: 's' };

  it('PayTech configuré, mode prod par défaut', () => {
    expect(etatPaiement({ ...cles, PUBLIC_URL: 'https://x.net' }, true)).toEqual({
      fournisseur: 'paytech',
      mode: 'prod',
      urlPublique: 'ok',
    });
  });

  it('lit le mode test, même mal écrit', () => {
    expect(etatPaiement({ ...cles, PAYTECH_ENV: ' TEST ' }, true).mode).toBe('test');
  });

  it('retombe sur Bictorys, puis sur rien', () => {
    expect(
      etatPaiement(
        { BICTORYS_API_URL: 'u', BICTORYS_API_KEY: 'k', BICTORYS_WEBHOOK_SECRET: 's' },
        true,
      ).fournisseur,
    ).toBe('bictorys');
    expect(etatPaiement({}, true).fournisseur).toBeNull();
  });
});

describe('alertesPaiement', () => {
  it('se tait quand tout va bien', () => {
    expect(alertesPaiement({ fournisseur: 'paytech', mode: 'prod', urlPublique: 'ok' })).toEqual(
      [],
    );
  });

  it('signale le mode test, l’absence de prestataire et une URL cassée', () => {
    expect(
      alertesPaiement({ fournisseur: 'paytech', mode: 'test', urlPublique: 'invalide' }),
    ).toHaveLength(2);
    expect(alertesPaiement({ fournisseur: null, mode: null, urlPublique: 'ok' })).toHaveLength(1);
  });
});
