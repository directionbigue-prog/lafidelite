import { describe, it, expect } from 'vitest';
import {
  joursRecents,
  serieQuotidienne,
  compteParCle,
  ventesParPack,
  packDeCommande,
  premiers,
  pourcentage,
  nombreLisible,
} from './tableau-de-bord';

const maintenant = new Date('2026-10-13T20:00:00Z');

describe('joursRecents', () => {
  it('rend la fenêtre du plus ancien à aujourd’hui', () => {
    expect(joursRecents(3, maintenant)).toEqual(['2026-10-11', '2026-10-12', '2026-10-13']);
  });
});

describe('serieQuotidienne', () => {
  it('garde les jours vides à zéro et ignore ce qui sort de la fenêtre', () => {
    const serie = serieQuotidienne(
      [
        { date: new Date('2026-10-13T01:00:00Z') },
        { date: new Date('2026-10-13T23:59:00Z') },
        { date: new Date('2026-10-11T12:00:00Z') },
        { date: new Date('2026-09-01T12:00:00Z') },
      ],
      3,
      maintenant,
    );
    expect(serie).toEqual([
      { jour: '2026-10-11', valeur: 1 },
      { jour: '2026-10-12', valeur: 0 },
      { jour: '2026-10-13', valeur: 2 },
    ]);
  });

  it('additionne des valeurs (un chiffre d’affaires) plutôt que des occurrences', () => {
    const serie = serieQuotidienne(
      [
        { date: new Date('2026-10-13T08:00:00Z'), valeur: 4900 },
        { date: new Date('2026-10-13T09:00:00Z'), valeur: 2000 },
      ],
      1,
      maintenant,
    );
    expect(serie).toEqual([{ jour: '2026-10-13', valeur: 6900 }]);
  });
});

describe('compteParCle', () => {
  it('pose les clés attendues à zéro et range null sous INCONNU', () => {
    expect(
      compteParCle(
        [
          { cle: 'SENT', n: 3 },
          { cle: null, n: 1 },
        ],
        ['PENDING', 'SENT'],
      ),
    ).toEqual({ PENDING: 0, SENT: 3, INCONNU: 1 });
  });
});

describe('ventesParPack', () => {
  it('regroupe par pack, garde les montants entiers, trie par montant', () => {
    expect(
      ventesParPack([
        { amount: 4900, metadata: { packId: 'ESSENTIEL' } },
        { amount: 9900, metadata: { packId: 'INTEGRAL' } },
        { amount: 4900, metadata: { packId: 'ESSENTIEL' } },
        { amount: 500, metadata: null },
      ]),
    ).toEqual([
      { packId: 'INTEGRAL', nombre: 1, montant: 9900 },
      { packId: 'ESSENTIEL', nombre: 2, montant: 9800 },
      { packId: 'AUTRE', nombre: 1, montant: 500 },
    ]);
  });

  it('une commande sans pack est « AUTRE », jamais ignorée', () => {
    expect(packDeCommande({ packId: null })).toBe('AUTRE');
    expect(packDeCommande('x')).toBe('AUTRE');
  });
});

describe('premiers', () => {
  it('garde les N plus grands et regroupe le reste', () => {
    expect(premiers({ SN: 10, FR: 5, CI: 2, BE: 1 }, 2)).toEqual([
      { cle: 'SN', valeur: 10 },
      { cle: 'FR', valeur: 5 },
      { cle: 'Autres', valeur: 3 },
    ]);
  });
});

describe('pourcentage et nombreLisible', () => {
  it('ne rend jamais NaN', () => {
    expect(pourcentage(3, 0)).toBe(0);
    expect(pourcentage(1, 3)).toBe(33);
  });

  it('groupe les milliers sans diviser', () => {
    expect(nombreLisible(118800)).toBe('118 800');
    expect(nombreLisible(900)).toBe('900');
  });
});
