// Assertions au niveau de la source — le dépôt ne monte pas de composants
// (ni jsdom ni Testing Library). Ce qu'on vérifie ici est ce qui se casse
// silencieusement : l'accessibilité et la séparation moteur / rendu.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'Damier.tsx'),
  'utf8',
);

/**
 * L'ouverture de la balise `<button …>` — ses attributs, et rien d'autre.
 *
 * `toContain('<button')` + `toContain('aria-label')` ne disent RIEN de la
 * cohérence de deux attributs sur un même élément : c'est exactement ce qui
 * a laissé passer un `aria-pressed` invalide sur un `role="gridcell"` avec
 * une suite verte. On extrait donc la balise et on assère dessus.
 *
 * Le `>` qui referme la balise est celui qui se trouve hors de toute
 * expression JSX — sans quoi la flèche de `onClick={() => …}` la couperait
 * en deux.
 */
function baliseCase(source: string): string {
  const debut = source.indexOf('<button');
  if (debut === -1) throw new Error('aucun <button> dans Damier.tsx');
  let accolades = 0;
  for (let i = debut; i < source.length; i += 1) {
    const c = source[i];
    if (c === '{') accolades += 1;
    else if (c === '}') accolades -= 1;
    else if (c === '>' && accolades === 0) return source.slice(debut, i + 1);
  }
  throw new Error('balise <button> non refermée dans Damier.tsx');
}

describe('accessibilité du damier', () => {
  it('se présente comme une grille', () => {
    expect(source).toContain('role="grid"');
  });

  it('fait de chaque case jouable un vrai bouton', () => {
    // Un `<div onClick>` n'est ni focusable ni annoncé ni actionnable au
    // clavier. Le damier doit être jouable sans souris.
    const balise = baliseCase(source);
    expect(balise).toContain('type="button"');
    expect(balise).toMatch(/aria-label=\{/);
    expect(balise).toMatch(/onClick=\{/);
  });

  it('annonce la sélection avec un état que le rôle de la case supporte', () => {
    // `role="gridcell"` écrase le rôle implicite `button`. Or `aria-pressed`
    // n'est un état que de `role="button"` : sur une cellule de grille il
    // est ignoré des lecteurs d'écran, et la sélection d'une pièce n'est
    // jamais annoncée — alors que le seul autre signal, l'anneau doré, est
    // purement visuel. `aria-selected` est l'état que `gridcell` supporte.
    const balise = baliseCase(source);
    expect(balise).toContain('role="gridcell"');
    expect(balise).not.toContain('aria-pressed');
    expect(balise).toMatch(/aria-selected=\{[^}]*selectionnee/);
  });

  it('montre les pièces que l’on peut prendre en main', () => {
    // La prise obligatoire rendue visible, et pas seulement écrite sous le
    // plateau. `jouables` ne contient que les pièces ayant un coup légal —
    // donc, dès qu'une prise existe, uniquement celles qui prennent le
    // maximum. Sans ce liseré, un joueur qui touchait une autre pièce ne
    // voyait rien se produire, sans comprendre pourquoi.
    //
    // Il doit rester distinct de la sélection : deux signaux identiques ne
    // diraient plus laquelle des pièces est réellement en main.
    expect(source).toContain('const mobilisable =');
    const balise = baliseCase(source);
    expect(balise).toMatch(/mobilisable\s*\?\s*'ring-1 ring-inset ring-gold\/45'/);
    expect(balise).toMatch(/selectionnee\s*\n?\s*\?\s*'ring-2 ring-inset ring-gold'/);
  });

  it('marque les cases claires comme décoratives', () => {
    // Les 50 cases claires ne sont jamais jouables : les annoncer
    // doublerait la longueur du damier pour un lecteur d’écran.
    expect(source).toContain('aria-hidden');
  });

  it('interpose des lignes entre la grille et ses cellules', () => {
    // Une grille ARIA sans `row` est invalide : les cellules doivent être
    // dans des lignes. `display: contents` les fait exister pour l'arbre
    // d'accessibilité sans casser la grille CSS.
    expect(source).toContain('role="row"');
    expect(source).toContain('className="contents"');
  });
});

describe('séparation entre le moteur et le rendu', () => {
  it('ne génère aucun coup lui-même', () => {
    // Le composant reçoit `jouables` et `destinations` ; s'il appelait le
    // générateur, la règle et le rendu commenceraient à diverger.
    expect(source).not.toContain('coupsLegaux');
    expect(source).not.toContain('raflesBrutes');
  });

  it('ne connaît pas la base de données', () => {
    expect(source).not.toContain('@/lib/api');
    expect(source).not.toContain('prisma');
  });
});

describe('palette', () => {
  it('utilise les deux teintes de damier du canevas', () => {
    // #EFE3D6 (clair) et #3D2036 (foncé) sont relevées dans le canevas de
    // design. Elles sont déclarées comme tokens plutôt qu'écrites en dur :
    // le dépôt interdit les valeurs hexadécimales dans les composants.
    expect(source).toContain('bg-damier-fonce');
    expect(source).toContain('bg-damier-clair');
  });

  it('oppose les deux camps en wine et en crème, comme le canevas', () => {
    expect(source).toContain('bg-wine');
    expect(source).toContain('bg-cream');
  });
});
