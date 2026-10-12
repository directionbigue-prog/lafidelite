import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { GEOMETRIE_MARQUE } from './Marque';

// La marque existe TROIS fois, et chaque copie a sa raison :
//   Marque.tsx      inline, pour l'en-tête de chaque écran
//   public/logo.svg pour ce qui sort du rendu React
//   app/icon.svg    sur fond encre, pour l'onglet du navigateur
//
// Trois copies d'un logo qui divergent, ce sont trois logos. Ces assertions
// comparent la GÉOMÉTRIE, pas les octets : les fichiers diffèrent légitimement
// par leur fond et leurs commentaires, mais les cercles et l'intersection
// doivent être identiques au chiffre près.

const here = dirname(fileURLToPath(import.meta.url));
const LOGO = resolve(here, '../../../public/logo.svg');
const ICONE = resolve(here, '../../app/icon.svg');
const COMPOSANT = resolve(here, 'Marque.tsx');

const logo = readFileSync(LOGO, 'utf8');
const icone = readFileSync(ICONE, 'utf8');
const composant = readFileSync(COMPOSANT, 'utf8');

/** Les cercles d'un SVG, sous forme comparable. */
function cercles(svg: string): string[] {
  return [...svg.matchAll(/<circle[^>]*>/g)]
    .map((m) => {
      const attr = (nom: string) => new RegExp(`${nom}="([^"]*)"`).exec(m[0])?.[1] ?? '';
      return `cx=${attr('cx')} cy=${attr('cy')} r=${attr('r')} w=${attr('stroke-width')}`;
    })
    .sort();
}

function chemin(svg: string): string {
  return /<path[^>]*\sd="([^"]*)"/.exec(svg)?.[1] ?? '';
}

describe('les trois copies de la marque portent la même géométrie', () => {
  it('deux cercles, aux mêmes coordonnées', () => {
    const attendu = [
      `cx=${GEOMETRIE_MARQUE.gaucheCx} cy=${GEOMETRIE_MARQUE.cy} r=${GEOMETRIE_MARQUE.r} w=${GEOMETRIE_MARQUE.epaisseur}`,
      `cx=${GEOMETRIE_MARQUE.droiteCx} cy=${GEOMETRIE_MARQUE.cy} r=${GEOMETRIE_MARQUE.r} w=${GEOMETRIE_MARQUE.epaisseur}`,
    ].sort();
    expect(cercles(logo), 'public/logo.svg').toEqual(attendu);
    expect(cercles(icone), 'app/icon.svg').toEqual(attendu);
  });

  it('la même intersection dorée', () => {
    expect(chemin(logo), 'public/logo.svg').toBe(GEOMETRIE_MARQUE.intersection);
    expect(chemin(icone), 'app/icon.svg').toBe(GEOMETRIE_MARQUE.intersection);
  });

  it('le même cadre de référence', () => {
    for (const [nom, svg] of [
      ['logo', logo],
      ['icone', icone],
    ] as const) {
      expect(/viewBox="([^"]*)"/.exec(svg)?.[1], nom).toBe('0 0 64 64');
    }
  });
});

describe('les couleurs sont celles de la charte, et rien d’autre', () => {
  // cream, gold, et l'encre du fond pour la seule icône d'onglet.
  const PALETTE = ['#F6EEE6', '#E8B860', '#170D1B'];

  it('aucune couleur hors palette', () => {
    for (const [nom, svg] of [
      ['public/logo.svg', logo],
      ['app/icon.svg', icone],
      ['Marque.tsx', composant],
    ] as const) {
      const trouvees = [...new Set(svg.match(/#[0-9A-Fa-f]{6}\b/g) ?? [])].map((c) =>
        c.toUpperCase(),
      );
      for (const couleur of trouvees) {
        expect(PALETTE, `${nom} utilise ${couleur}`).toContain(couleur);
      }
    }
  });

  it('le logo reste transparent, l’icône d’onglet ne l’est pas', () => {
    // Un logo à fond opaque posé sur le produit ferait une tache ; une icône
    // transparente serait invisible dans un onglet en thème clair.
    expect(logo, 'public/logo.svg ne doit pas porter de fond').not.toMatch(/<rect/);
    expect(icone, 'app/icon.svg doit porter le fond encre').toMatch(/<rect[^>]*#170D1B/);
  });
});

describe('la marque est posée là où elle doit l’être', () => {
  it('dans la coquille de l’application', () => {
    const shell = readFileSync(resolve(here, '../app/AppShell.tsx'), 'utf8');
    expect(shell).toContain('<Marque');
    // La pastille wine qu'elle remplace ne doit pas revenir à côté d'elle.
    expect(shell).not.toContain('rounded-full bg-wine shadow-');
  });

  it('dans l’en-tête de la page d’accueil', () => {
    const landing = readFileSync(resolve(here, '../../app/page.tsx'), 'utf8');
    expect(landing).toContain('<Marque');
  });

  it('est décorative : elle jouxte toujours le nom écrit', () => {
    // Sinon un lecteur d'écran annoncerait « Cœur Fidèle » deux fois.
    expect(composant).toContain('aria-hidden="true"');
  });
});
