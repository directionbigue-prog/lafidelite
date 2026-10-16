// Les moyens de paiement annoncés sont ceux que PayTech propose, et ils sont
// écrits une seule fois.
//
// Jusqu'au 16/10/2026 la FAQ de l'accueil annonçait « Wave, Orange Money,
// MTN MoMo et Moov » pendant que le pied de la même page, et la page
// d'achat, disaient « Wave, Orange Money, Free Money ou carte » — et les
// données structurées répétaient la FAQ à Google. Trois copies d'une même
// phrase, dont une fausse.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MOYENS_DE_PAIEMENT } from './achat';
import { buildLandingDesignData } from '@/lib/landing/design-data';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const lire = (chemin: string) => readFileSync(resolve(SRC, chemin), 'utf8');

describe('les moyens de paiement annoncés', () => {
  it('sont ceux de PayTech', () => {
    expect(MOYENS_DE_PAIEMENT).toBe('Wave, Orange Money, Free Money ou carte bancaire');
  });

  it('la FAQ les reprend de la constante', () => {
    const reponse = buildLandingDesignData().faq.find((f) => /payer/i.test(f.q))?.a ?? '';
    expect(reponse.startsWith(MOYENS_DE_PAIEMENT)).toBe(true);
  });

  it("l'accueil et la page d'achat l'utilisent au lieu de la recopier", () => {
    for (const fichier of ['app/page.tsx', 'app/acheter/[pack]/page.tsx']) {
      const source = lire(fichier);
      expect(source, fichier).toMatch(/\{MOYENS_DE_PAIEMENT\}/);
      expect(source, fichier).not.toMatch(/Wave, Orange Money, Free Money ou carte/);
    }
  });

  it('aucun texte du produit ne promet MTN MoMo ni Moov', () => {
    for (const fichier of [
      'lib/landing/design-data.ts',
      'app/page.tsx',
      'app/tarifs/page.tsx',
      'app/acheter/[pack]/page.tsx',
    ]) {
      // Les commentaires peuvent raconter l'histoire ; seul le texte compte.
      const texte = lire(fichier)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(texte, fichier).not.toMatch(/MTN|Moov/);
    }
  });

  it('/tarifs nomme le prestataire réel, PayTech, et non Bictorys', () => {
    // « notre prestataire, Bictorys » est resté affiché jusqu'au 16/10/2026,
    // trois jours après le passage à PayTech.
    const texte = lire('app/tarifs/page.tsx')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(texte).not.toMatch(/Bictorys/);
    expect(texte).toMatch(/PayTech/);
    expect(texte).toMatch(/\{MOYENS_DE_PAIEMENT\}/);
  });
});
