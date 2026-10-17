import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALIGNMENT_POINTS_PER_MATCH } from '@/lib/server/game/scoring';
import { ACCORDS_EXEMPLE, partieExemple } from './partie-exemple';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('la partie d’exemple du héros', () => {
  const partie = partieExemple(5);

  it('compte ses accords sur les questions du Face à face', () => {
    expect(partie.accords).toBe(ACCORDS_EXEMPLE);
    expect(partie.sur).toBe(5);
  });

  it('affiche un gain que le moteur produit vraiment', () => {
    // Le canevas montrait 297. Un gain de couple croît avec les accords et
    // vaut au moins les points d'accord de chaque réponse commune.
    expect(partie.accord).toBeGreaterThanOrEqual(ACCORDS_EXEMPLE * ALIGNMENT_POINTS_PER_MATCH);
    expect(partieExemple(5).accord).toBe(partie.accord);
    expect(partieExemple(5).accord).toBeGreaterThan(partieExemple(ACCORDS_EXEMPLE - 1).accord);
  });

  it('nomme le niveau en français, jamais par sa valeur brute', () => {
    expect(partie.niveau).toMatch(/^[A-ZÀ-Ý][a-zà-ÿ]+$/);
    expect(partie.niveau).not.toBe(partie.niveau.toUpperCase());
  });

  it('ne promet pas plus d’accords qu’il n’y a de questions', () => {
    expect(partieExemple(2).accords).toBe(2);
  });

  it('est lu par l’écran de fin, et non recopié en chiffres', () => {
    // Sans les commentaires : l'en-tête du fichier raconte le « 297 » et le
    // « +25 » du canevas, et doit pouvoir le faire.
    const maquettes = readFileSync(resolve(SRC, 'components/landing/Maquettes.tsx'), 'utf8')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(maquettes).toMatch(/partieExemple\(/);
    expect(maquettes).toMatch(/<CompteurScore cible=\{partie\.accord\}/);
    expect(maquettes).not.toMatch(/\b297\b|\+25\b/);
  });
});
