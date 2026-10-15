// Le bouton Google réveille la base avant que la personne revienne de Google.
//
// Source-level (pas de jsdom ici) : on extrait le corps du `useEffect` et le
// gestionnaire `onClick`, et on vérifie l'appel À L'INTÉRIEUR — un simple
// `toContain('prechaufferServeur')` serait satisfait par l'import seul.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'GoogleButton.tsx'),
  'utf8',
);

function blocApres(marqueur: string): string {
  const debut = source.indexOf(marqueur);
  expect(debut, marqueur).toBeGreaterThan(-1);
  return source.slice(debut, source.indexOf('\n  }', debut) + 4);
}

describe('GoogleButton préchauffe le serveur', () => {
  it("à l'affichage", () => {
    expect(blocApres('useEffect(() => {')).toMatch(/prechaufferServeur\(\)/);
  });

  it('au clic', () => {
    expect(blocApres('function auClic(')).toMatch(/prechaufferServeur\(\)/);
    expect(source).toMatch(/onClick=\{auClic\}/);
  });

  it("remet le libellé au retour arrière (cache de l'historique)", () => {
    const effet = blocApres('useEffect(() => {');
    expect(effet).toMatch(/addEventListener\('pageshow'/);
    expect(effet).toMatch(/if \(e\.persisted\) setEnCours\(false\)/);
  });
});
