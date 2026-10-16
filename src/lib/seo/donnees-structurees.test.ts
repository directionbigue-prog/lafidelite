import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PACKS_PAYANTS, packDecouverte } from '@/lib/game/packs';
import { donneesStructureesAccueil, scriptJsonLd } from './donnees-structurees';

const FAQ = [
  { num: '01', q: 'Une question ?', a: 'Une réponse.' },
  { num: '02', q: 'Une autre ?', a: 'Une autre réponse.' },
];

function bloc(type: string) {
  const trouve = donneesStructureesAccueil(FAQ)['@graph'].find((n) => n['@type'] === type);
  expect(trouve, type).toBeDefined();
  return trouve as Record<string, unknown>;
}

describe("les données structurées de l'accueil", () => {
  it('décrivent la marque, le site, l’application et la FAQ', () => {
    const graphe = donneesStructureesAccueil(FAQ);
    expect(graphe['@context']).toBe('https://schema.org');
    expect(graphe['@graph'].map((n) => n['@type']).sort()).toEqual(
      ['FAQPage', 'Organization', 'WebApplication', 'WebSite'].sort(),
    );
  });

  it('annoncent les prix du registre des packs, jamais un prix recopié', () => {
    const offres = bloc('WebApplication').offers as {
      name: string;
      price: string;
      priceCurrency: string;
    }[];
    const attendues = [packDecouverte(), ...PACKS_PAYANTS];
    expect(offres.map((o) => o.name)).toEqual(attendues.map((p) => p.nom));
    for (const [i, pack] of attendues.entries()) {
      expect(offres[i]!.price).toBe(String(pack.prix));
      expect(offres[i]!.priceCurrency).toBe(pack.devise);
    }
  });

  it('reprennent mot pour mot la FAQ affichée', () => {
    // Google exige que le balisage décrive ce que la page MONTRE : une
    // question présente dans le JSON-LD et absente de l'écran est une
    // donnée structurée trompeuse.
    const questions = bloc('FAQPage').mainEntity as {
      name: string;
      acceptedAnswer: { text: string };
    }[];
    expect(questions.map((q) => q.name)).toEqual(FAQ.map((f) => f.q));
    expect(questions.map((q) => q.acceptedAnswer.text)).toEqual(FAQ.map((f) => f.a));
  });

  it("n'inventent ni note ni avis", () => {
    // Une note sans avis réels est une donnée structurée fabriquée — la
    // pénalité manuelle de Google vise exactement cela.
    const json = JSON.stringify(donneesStructureesAccueil(FAQ));
    expect(json).not.toMatch(/aggregateRating|"review"/i);
  });

  it('pointent vers le domaine canonique en https', () => {
    expect(bloc('WebSite').url).toMatch(/^https:\/\/[^/]+\/$/);
    expect(bloc('Organization').logo).toMatch(/^https:\/\/.+\/icon-512\.png$/);
  });
});

describe('scriptJsonLd', () => {
  it('ne peut pas refermer la balise <script> qui le contient', () => {
    const sortie = scriptJsonLd({ texte: '</script><script>alert(1)</script>' });
    expect(sortie).not.toContain('</script');
    expect(sortie).not.toContain('<');
    expect(JSON.parse(sortie)).toEqual({ texte: '</script><script>alert(1)</script>' });
  });
});

describe("l'accueil sert ces données", () => {
  const page = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../app/page.tsx'),
    'utf8',
  );

  it('dans une balise application/ld+json, construite depuis la FAQ affichée', () => {
    // La même variable que la grille de la FAQ : si l'écran change de
    // questions, le balisage suit.
    expect(page).toMatch(
      /type="application\/ld\+json"[\s\S]{0,120}scriptJsonLd\(donneesStructureesAccueil\(faqEssentielle\)\)/,
    );
    expect(page).toMatch(/faqEssentielle\.map\(/);
  });
});
