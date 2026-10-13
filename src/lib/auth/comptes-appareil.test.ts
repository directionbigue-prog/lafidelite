import { describe, it, expect } from 'vitest';
import {
  COMPTES_MAX,
  ecrireCoffre,
  libelleCompte,
  lireCoffre,
  ranger,
  retirer,
} from './comptes-appareil';

const e = (userId: string, jeton = `jwt-${userId}`) => ({ userId, jeton });

describe('lireCoffre', () => {
  it('rend une liste vide pour tout ce qui n’a pas la bonne forme', () => {
    expect(lireCoffre(undefined)).toEqual([]);
    expect(lireCoffre('pas du json')).toEqual([]);
    expect(lireCoffre('{"a":1}')).toEqual([]);
    expect(lireCoffre('[1, null, ""]')).toEqual([]);
  });

  it('relit ce que ecrireCoffre a écrit, plafonné', () => {
    const plein = Array.from({ length: COMPTES_MAX + 3 }, (_, i) => e(`u${i}`));
    expect(lireCoffre(ecrireCoffre(plein))).toHaveLength(COMPTES_MAX);
    expect(lireCoffre(ecrireCoffre([e('a'), e('b')]))).toEqual(['jwt-a', 'jwt-b']);
  });
});

describe('ranger', () => {
  it('met le compte en tête, sans doublon, avec son jeton le plus récent', () => {
    const r = ranger([e('a'), e('b', 'ancien')], e('b', 'neuf'));
    expect(r).toEqual([e('b', 'neuf'), e('a')]);
  });

  it('n’y laisse jamais le compte actif', () => {
    expect(ranger([e('a'), e('b')], e('c'), 'a')).toEqual([e('c'), e('b')]);
    expect(ranger([e('a')], e('a'), 'a')).toEqual([]);
  });

  it('fait sortir le plus ancien au-delà du plafond', () => {
    const plein = Array.from({ length: COMPTES_MAX }, (_, i) => e(`u${i}`));
    const r = ranger(plein, e('nouveau'));
    expect(r).toHaveLength(COMPTES_MAX);
    expect(r[0]!.userId).toBe('nouveau');
    expect(r.map((x) => x.userId)).not.toContain(`u${COMPTES_MAX - 1}`);
  });
});

describe('retirer', () => {
  it('retire un seul compte', () => {
    expect(retirer([e('a'), e('b')], 'a')).toEqual([e('b')]);
  });
});

describe('libelleCompte', () => {
  it('n’affiche jamais l’adresse de remplacement d’un invité', () => {
    expect(libelleCompte(null, 'partenaire-x@invite.coeurfidele.invalid', true)).toEqual({
      titre: 'Partenaire invité',
      sousTitre: 'Compte invité, sans email',
    });
    expect(libelleCompte('Awa', 'awa@gmail.com', false)).toEqual({
      titre: 'Awa',
      sousTitre: 'awa@gmail.com',
    });
  });
});
