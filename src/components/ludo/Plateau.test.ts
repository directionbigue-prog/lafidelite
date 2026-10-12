// Assertions au niveau de la source — le dépôt ne monte pas de composants
// (ni jsdom ni Testing Library). Ce qu'on vérifie ici est ce qui se casse
// silencieusement : l'accessibilité et la séparation moteur / rendu.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'Plateau.tsx'),
  'utf8',
);

describe('le plateau est un affichage, pas la surface de jeu', () => {
  // Correction du 2026-09-10 : une case du ruban de 52 cases fait environ
  // 28px sur un téléphone, bien sous le seuil tactile de 48px. Le pion ne
  // peut donc plus être le bouton — l'action a déménagé dans la rangée de
  // boutons de la page (`app/salon/ludo/page.tsx`), et ce composant ne
  // reçoit plus rien à cliquer.
  it('ne contient aucun élément interactif', () => {
    expect(source).not.toContain('<button');
    expect(source).not.toMatch(/onClick=/);
  });

  it('n’accepte plus `jouables` ni `onPion`', () => {
    // Défense contre une régression qui referait du pion un bouton : si
    // ces props reviennent dans `PlateauProps`, c'est que quelqu'un a
    // recommencé à faire du plateau une surface cliquable.
    //
    // Lookaround plutôt que `\b` : `descriptionPion` contient littéralement
    // la sous-chaîne `onPion` (…descripti-onPion…), et `\b` ne voit aucune
    // frontière entre deux lettres — un `not.toContain('onPion')` nu serait
    // donc toujours rouge, pour la mauvaise raison.
    expect(source).not.toContain('jouables');
    expect(source).not.toMatch(/(?<![A-Za-z])onPion(?![A-Za-z])/);
  });

  it('accepte un pion à mettre en évidence, posé par la rangée d’actions', () => {
    expect(source).toContain('pionSurligne: PionSurligne | null');
  });
});

describe('les pions sont des marqueurs nommés, pas des boutons', () => {
  it('utilise `role="img"` pour garder le nom accessible sans prétendre à une interaction', () => {
    // Un `<span>` nu verrait son `aria-label` ignoré, faute de rôle qui le
    // supporte : `role="img"` est le rôle le plus proche d'« un marqueur
    // visuel nommé » que ce composant puisse honnêtement revendiquer.
    expect(source).toContain('role="img"');
    expect(source).toMatch(/aria-label=\{descriptionPion/);
  });

  it('ne pose jamais `aria-pressed` ni `aria-selected`', () => {
    // Aucun état de sélection n'existe plus ici : le choix se fait dans la
    // rangée d'actions de la page, jamais sur le plateau.
    expect(source).not.toContain('aria-pressed');
    expect(source).not.toContain('aria-selected');
  });

  it('met en évidence exactement le pion désigné par `pionSurligne`', () => {
    expect(source).toMatch(
      /const surligne = pionSurligne\?\.camp === camp && pionSurligne\.index === index;/,
    );
    expect(source).toMatch(/surligne \? 'scale-125 ring-2 ring-gold' : ''/);
  });
});

describe('accessibilité du circuit', () => {
  it('se présente comme une grille', () => {
    expect(source).toContain('role="grid"');
  });

  it('interpose des lignes entre la grille et ses cellules', () => {
    expect(source).toContain('role="row"');
    expect(source).toContain('className="contents"');
  });

  it('nomme chaque case, et distingue les deux cases sûres', () => {
    // Les deux entrées sont la seule sécurité du plateau (voir la spec) :
    // un pion qui s'y trouve ne peut jamais être pris. Ça doit se lire dans
    // le nom accessible de la case, pas seulement dans une teinte.
    expect(source).toContain('role="gridcell"');
    expect(source).toMatch(/estCaseSure\(caseCircuit\)/);
    expect(source).toMatch(/case sûre/);
  });
});

describe('le circuit se déplie en anneau, pas en dents de scie', () => {
  it('lit une rangée sur deux à l’envers (boustrophédon)', () => {
    // Sans ce retournement, la case 12 (fin de la première rangée) et la
    // case 13 (début de la seconde) se retrouveraient aux deux extrémités
    // opposées de l'écran au lieu d'être visuellement adjacentes.
    expect(source).toContain('rangees.push(r % 2 === 0 ? cases : [...cases].reverse());');
  });
});

describe('quel chemin il reste à parcourir', () => {
  it('le nom accessible d’un pion en circuit ou en colonne dit combien de cases avant l’arrivée', () => {
    expect(source).toMatch(/DISTANCE_ARRIVEE - distanceDe\(pion\)/);
    expect(source).toMatch(/avant l’arrivée/);
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

describe('palette', () => {
  it('oppose les deux camps en wine et en crème, comme les dames et l’Awalé', () => {
    expect(source).toContain('bg-wine');
    expect(source).toContain('bg-cream');
  });

  it('n’écrit aucune couleur en hexadécimal', () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });
});
