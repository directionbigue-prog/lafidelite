import { describe, expect, it } from 'vitest';
import {
  BADGES,
  etatDesBadges,
  joursActifs,
  nouveauxBadges,
  souvenirs,
  type Activite,
} from './badges';
import { COMPLICITY_THRESHOLDS } from '@/lib/server/game/scoring';

const vide: Activite = { forme: null, parties: [], quotidiennes: [] };

function badge(a: Activite, id: string) {
  const b = etatDesBadges(a).find((x) => x.id === id);
  if (!b) throw new Error(`badge ${id} absent`);
  return b;
}

describe('badges', () => {
  it('les identifiants sont uniques', () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });

  it('les badges de niveau couvrent exactement les niveaux de l’échelle de scoring', () => {
    // Un niveau ajouté à `scoring.ts` sans badge, ou un badge pour un niveau
    // qui n'existe plus, ferait mentir l'écran sans rien faire échouer.
    const niveaux = COMPLICITY_THRESHOLDS.map((t) => t.level).filter((l) => l !== 'DECOUVERTE');
    const badgesNiveau = BADGES.filter((b) => b.famille === 'niveau').map((b) =>
      b.id.replace('niveau-', '').toUpperCase(),
    );
    expect(badgesNiveau).toEqual(niveaux);
  });

  it('aucun badge sans activité', () => {
    expect(etatDesBadges(vide).every((b) => b.obtenuLe === null && b.valeur === 0)).toBe(true);
  });

  it('date la première partie', () => {
    const a: Activite = { ...vide, parties: [{ jour: '2026-10-03', niveau: 'DECOUVERTE' }] };
    expect(badge(a, 'premiere-partie').obtenuLe).toBe('2026-10-03');
    expect(badge(a, 'dix-parties')).toMatchObject({ valeur: 1, obtenuLe: null });
  });

  it('un saut de deux niveaux débloque aussi le niveau intermédiaire, le même jour', () => {
    const a: Activite = { ...vide, parties: [{ jour: '2026-10-05', niveau: 'FUSIONNELS' }] };
    expect(badge(a, 'niveau-complices').obtenuLe).toBe('2026-10-05');
    expect(badge(a, 'niveau-fusionnels').obtenuLe).toBe('2026-10-05');
    expect(badge(a, 'niveau-inseparables').obtenuLe).toBeNull();
  });

  it('un niveau inconnu n’atteint rien', () => {
    const a: Activite = { ...vide, parties: [{ jour: '2026-10-05', niveau: 'BIZARRE' }] };
    expect(badge(a, 'niveau-complices').obtenuLe).toBeNull();
  });

  it('la série mêle parties et questions du jour, et plafonne la valeur à la cible', () => {
    const a: Activite = {
      ...vide,
      parties: [{ jour: '2026-10-01', niveau: 'DECOUVERTE' }],
      quotidiennes: [
        { jour: '2026-10-02', telepathie: false },
        { jour: '2026-10-03', telepathie: false },
        { jour: '2026-10-04', telepathie: false },
      ],
    };
    expect(joursActifs(a)).toHaveLength(4);
    expect(badge(a, 'serie-3')).toMatchObject({ valeur: 3, obtenuLe: '2026-10-03' });
    expect(badge(a, 'serie-7')).toMatchObject({ valeur: 4, obtenuLe: null });
  });

  it('télépathes : date la première question où chacun a deviné l’autre', () => {
    const a: Activite = {
      ...vide,
      quotidiennes: [
        { jour: '2026-10-02', telepathie: false },
        { jour: '2026-10-04', telepathie: true },
      ],
    };
    expect(badge(a, 'telepathes').obtenuLe).toBe('2026-10-04');
  });
});

describe('souvenirs', () => {
  it('commence par la naissance de l’Espace et va du plus récent au plus ancien', () => {
    const a: Activite = {
      forme: '2026-09-30',
      parties: [{ jour: '2026-10-03', niveau: 'COMPLICES' }],
      quotidiennes: [],
    };
    const s = souvenirs(a);
    expect(s[s.length - 1]?.titre).toBe('Votre Espace Couple est né');
    expect(s[0]?.jour).toBe('2026-10-03');
    // Jamais une réponse : seulement des dates, des titres et des descriptions.
    for (const entree of s)
      expect(Object.keys(entree).sort()).toEqual(['description', 'jour', 'titre']);
  });

  it('nouveauxBadges ne rend que ceux obtenus le jour demandé', () => {
    const a: Activite = { ...vide, parties: [{ jour: '2026-10-03', niveau: 'DECOUVERTE' }] };
    expect(nouveauxBadges(etatDesBadges(a), '2026-10-03').map((b) => b.id)).toEqual([
      'premiere-partie',
    ]);
    expect(nouveauxBadges(etatDesBadges(a), '2026-10-04')).toEqual([]);
  });
});
