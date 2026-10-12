// Assertions au niveau de la source — le dépôt ne monte pas de composants
// (ni jsdom ni Testing Library). Ce qu'on vérifie ici est ce qui se casse
// silencieusement : l'orientation du plateau et la séparation moteur / rendu.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'Plateau.tsx'),
  'utf8',
);

/**
 * L'ouverture de la balise `<button …>` — ses attributs, et rien d'autre.
 * Même technique que `components/dames/Damier.test.ts` : on coupe au `>`
 * qui referme la balise hors de toute expression JSX (`onClick={() => …}`),
 * pas au premier `)` littéral.
 */
function baliseCase(source: string): string {
  const debut = source.indexOf('<button');
  if (debut === -1) throw new Error('aucun <button> dans Plateau.tsx');
  let accolades = 0;
  for (let i = debut; i < source.length; i += 1) {
    const c = source[i];
    if (c === '{') accolades += 1;
    else if (c === '}') accolades -= 1;
    else if (c === '>' && accolades === 0) return source.slice(debut, i + 1);
  }
  throw new Error('balise <button> non refermée dans Plateau.tsx');
}

describe('orientation du plateau — l’erreur la plus facile à commettre', () => {
  it('lit la rangée de sud de gauche à droite, 0 à 5', () => {
    expect(source).toContain('const RANGEE_SUD: readonly number[] = [0, 1, 2, 3, 4, 5];');
  });

  it('lit la rangée de nord de DROITE à GAUCHE — 6 à droite, 11 à gauche', () => {
    // La tentation naturelle est [6, 7, 8, 9, 10, 11] : elle inverserait le
    // sens du semis à l'écran (voir le commentaire du fichier). Un tableau
    // qui affiche 6 en tête romprait l'adjacence visuelle avec le trou 5,
    // juste en dessous.
    expect(source).toContain('const RANGEE_NORD: readonly number[] = [11, 10, 9, 8, 7, 6];');
    expect(source).not.toContain('const RANGEE_NORD: readonly number[] = [6, 7, 8, 9, 10, 11];');
  });

  it('rend la rangée de nord au-dessus de celle de sud', () => {
    // L'ordre d'appel décide de l'ordre d'affichage dans la grille CSS :
    // le premier `role="row"` rendu est la rangée du haut.
    const debut = source.indexOf('return (', source.indexOf('export function Plateau'));
    const corpsRendu = source.slice(debut);
    const iNord = corpsRendu.indexOf('rangee(RANGEE_NORD)');
    const iSud = corpsRendu.indexOf('rangee(RANGEE_SUD)');
    expect(iNord).toBeGreaterThan(-1);
    expect(iSud).toBeGreaterThan(iNord);
  });
});

describe('accessibilité du plateau', () => {
  it('se présente comme une grille', () => {
    expect(source).toContain('role="grid"');
  });

  it('interpose des lignes entre la grille et ses cellules', () => {
    expect(source).toContain('role="row"');
  });

  it('fait de chaque trou jouable un vrai bouton', () => {
    const balise = baliseCase(source);
    expect(balise).toContain('type="button"');
    expect(balise).toMatch(/aria-label=\{/);
    expect(balise).toMatch(/onClick=\{/);
  });

  it('désactive les trous non jouables plutôt que de les rendre muets', () => {
    const balise = baliseCase(source);
    expect(balise).toMatch(/disabled=\{!cliquable\}/);
  });

  it('annonce le dernier coup avec un état que le rôle de la case supporte', () => {
    // `role="gridcell"` écrase le rôle implicite `button` : `aria-pressed`
    // n'est un état que de `role="button"` et serait ignoré ici, comme sur
    // le Damier des dames.
    const balise = baliseCase(source);
    expect(balise).toContain('role="gridcell"');
    expect(balise).not.toContain('aria-pressed');
    expect(balise).toMatch(/aria-selected=\{[^}]*joueEnDernier/);
  });
});

describe('séparation entre le moteur et le rendu', () => {
  it('ne génère aucun coup lui-même', () => {
    expect(source).not.toContain('coupsLegaux');
    expect(source).not.toContain('appliquer(');
  });

  it('ne connaît pas la base de données', () => {
    expect(source).not.toContain('@/lib/api');
    expect(source).not.toContain('prisma');
  });
});

describe('les greniers des deux joueurs', () => {
  it('affiche le grenier de chaque camp', () => {
    expect(source).toMatch(/<Grenier\s+nom=\{noms\.nord\}\s+valeur=\{etat\.greniers\.nord\}/);
    expect(source).toMatch(/<Grenier\s+nom=\{noms\.sud\}\s+valeur=\{etat\.greniers\.sud\}/);
  });
});
