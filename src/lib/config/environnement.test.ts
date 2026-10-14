import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  defautsDeValeur,
  diagnostiquerEnvironnement,
  libelleSuspecte,
  VARIABLES_SURVEILLEES,
} from './environnement';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('defautsDeValeur', () => {
  it('voit le BOM qui a cassé les paiements le 13/10/2026', () => {
    expect(defautsDeValeur('\uFEFFhttps://www.coeurfidele.net')).toEqual(['BOM']);
  });

  it('voit un espace ou un retour à la ligne en tête ou en queue', () => {
    expect(defautsDeValeur('secret ')).toEqual(['espace']);
    expect(defautsDeValeur(' secret')).toEqual(['espace']);
    expect(defautsDeValeur('secret\n')).toEqual(['espace']);
    expect(defautsDeValeur('secret\r\n')).toEqual(['espace']);
  });

  it('voit les caractères invisibles au milieu', () => {
    expect(defautsDeValeur('abc\u200Bdef')).toEqual(['invisible']);
    expect(defautsDeValeur('abc\u00A0def')).toEqual(['invisible']);
  });

  it('voit une valeur entièrement collée avec ses guillemets', () => {
    expect(defautsDeValeur('"https://www.coeurfidele.net"')).toEqual(['guillemets']);
    expect(defautsDeValeur("'abc'")).toEqual(['guillemets']);
  });

  it('cumule les défauts', () => {
    expect(defautsDeValeur('\uFEFF"abc" ')).toEqual(['BOM', 'espace', 'guillemets']);
  });

  it('laisse passer les valeurs propres, même avec des guillemets internes', () => {
    for (const propre of [
      'https://www.coeurfidele.net',
      '"Cœur Fidèle" <noreply@coeurfidele.net>',
      'postgresql://u:p@h/db?sslmode=require',
      'a b c',
      'prod',
    ]) {
      expect(defautsDeValeur(propre), propre).toEqual([]);
    }
  });
});

describe('diagnostiquerEnvironnement', () => {
  it('nomme la variable et le défaut, jamais la valeur', () => {
    const suspectes = diagnostiquerEnvironnement({
      PUBLIC_URL: '\uFEFFhttps://www.coeurfidele.net',
      CRON_SECRET: 'tres-secret ',
      PAYTECH_ENV: 'prod',
    });
    expect(suspectes).toEqual([
      { variable: 'CRON_SECRET', defauts: ['espace'] },
      { variable: 'PUBLIC_URL', defauts: ['BOM'] },
    ]);
    expect(JSON.stringify(suspectes)).not.toContain('tres-secret');
    expect(suspectes.map(libelleSuspecte)).toEqual(['CRON_SECRET (espace)', 'PUBLIC_URL (BOM)']);
  });

  it('ignore une variable absente ou vide', () => {
    expect(diagnostiquerEnvironnement({ PUBLIC_URL: '', CRON_SECRET: undefined })).toEqual([]);
  });

  it('ne regarde que les variables du produit', () => {
    expect(diagnostiquerEnvironnement({ PATH: ' /usr/bin ' })).toEqual([]);
  });
});

describe('VARIABLES_SURVEILLEES couvre .env.example', () => {
  it('chaque variable documentée est surveillée', () => {
    const exemple = readFileSync(path.join(RACINE, '.env.example'), 'utf8');
    const documentees = [
      ...new Set([...exemple.matchAll(/^#? ?([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1] as string)),
    ];
    expect(documentees.length).toBeGreaterThan(50);
    const surveillees = new Set<string>(VARIABLES_SURVEILLEES);
    expect(documentees.filter((nom) => !surveillees.has(nom))).toEqual([]);
  });
});
