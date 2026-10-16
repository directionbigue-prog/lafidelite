// La landing ne garde aucune trace du canevas qui l'a produite (16/10/2026).
//
// Demandé par le propriétaire du produit : « enlever les signes qui montrent
// l'IA ». Relevé ce jour-là sur la page en ligne :
//   · l'image du héros était une CAPTURE du canevas — la fausse carte « Score
//     du couple 248 · Niveau : Complices » et le bord de la maquette étaient
//     gravés dans les pixels, en plus des deux cartouches posés par-dessus ;
//   · cinq liens « # » qui ne menaient nulle part (Confidentialité, CGU,
//     Support WhatsApp, English, « Poser la vôtre sur WhatsApp ») ;
//   · des chiffres et badges sans source (« Le plus choisi », « Inscription
//     en 20 secondes », « réponses chiffrées ») ;
//   · le tiret cadratin, devenu la signature la plus repérée du texte généré.
//
// Les lignes de COMMENTAIRE sont retirées avant de chercher : elles racontent
// cette histoire et citent forcément ce qu'elles interdisent.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const texte = (chemin: string) =>
  readFileSync(resolve(SRC, chemin), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const LANDING = [
  'app/page.tsx',
  'lib/landing/design-data.ts',
  'components/landing/SignupCard.tsx',
  'components/landing/FilmPub.tsx',
];

describe('la landing ne montre aucune trace de maquette', () => {
  it('le héros sert la photo seule, pas la capture du canevas', () => {
    const page = texte('app/page.tsx');
    expect(page).not.toMatch(/hero-couple-landing/);
    expect(page).toMatch(/\/images\/hero-couple-portrait\.webp/);
    expect(page).not.toMatch(/cf-badge-(left|right)|Score du couple|Niveau : Complices/);
  });

  it('aucun lien ne pointe vers « # »', () => {
    expect(texte('app/page.tsx')).not.toMatch(/href="#"/);
  });

  it('aucun chiffre ni badge sans source', () => {
    for (const fichier of LANDING) {
      const source = texte(fichier);
      for (const interdit of [
        /Le plus choisi/,
        /Inscription en 20 secondes/,
        /chiffrées/,
        /écrites à la main/,
      ]) {
        expect(interdit.test(source), `${fichier} : ${interdit.source}`).toBe(false);
      }
    }
  });

  it('aucun tiret cadratin dans le texte affiché ni dans les descriptions de partage', () => {
    for (const fichier of [...LANDING, 'app/layout.tsx', 'lib/seo/pages.ts']) {
      expect(texte(fichier), fichier).not.toContain('—');
    }
    for (const alt of ['app/opengraph-image.alt.txt', 'app/twitter-image.alt.txt']) {
      expect(readFileSync(resolve(SRC, alt), 'utf8'), alt).not.toContain('—');
    }
  });
});
