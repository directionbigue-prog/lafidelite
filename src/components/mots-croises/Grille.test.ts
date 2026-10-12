// Assertions au niveau de la source — le dépôt ne monte pas de composants
// (ni jsdom ni Testing Library). Ce qu'on vérifie ici est ce qui se casse
// silencieusement : l'accessibilité et la séparation moteur / rendu.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'Grille.tsx'),
  'utf8',
);

describe('accessibilité de la grille', () => {
  it('se présente comme une grille, avec des lignes entre elle et ses cellules', () => {
    expect(source).toContain('role="grid"');
    expect(source).toContain('role="row"');
    expect(source).toContain('className="contents"');
  });

  it('annonce chaque case comme une cellule de grille', () => {
    const occurrences = source.match(/role="gridcell"/g) ?? [];
    expect(occurrences).toHaveLength(2); // case noire, case-lettre
  });

  it('annonce les cases noires comme non jouables, jamais en les cachant', () => {
    // Contrairement aux cases claires du damier (aria-hidden, purement
    // décoratives), une case noire de mots croisés fait partie du sens de
    // la grille — elle doit rester dans l'arbre d'accessibilité.
    expect(source).toContain('case noire, non jouable');
    expect(source).not.toMatch(/type === 'noire'[\s\S]{0,120}aria-hidden/);
  });

  it('ne rend jamais une case non trouvée cliquable ou commandable', () => {
    expect(source).not.toContain('onClick');
    expect(source).not.toContain('<button');
  });
});

describe('séparation entre le moteur et le rendu', () => {
  it('ne compare ni ne décide jamais d’un mot lui-même', () => {
    expect(source).not.toContain('tenterMot');
    expect(source).not.toContain('matriceLettres');
  });

  it('ne connaît pas la base de données', () => {
    expect(source).not.toContain('@/lib/api');
    expect(source).not.toContain('prisma');
  });
});
