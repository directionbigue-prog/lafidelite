import { describe, expect, it } from 'vitest';
import { calculerSerie, premierJourAtteignant } from './serie';
import { choisirQuestionDuJour, decaler, ecartEnJours, estUnJour, jourDe } from './jour';

describe('jour', () => {
  it('lit une date UTC au format AAAA-MM-JJ', () => {
    expect(jourDe(new Date('2026-10-13T23:59:59.000Z'))).toBe('2026-10-13');
  });

  it('refuse une date impossible que Date.parse normaliserait', () => {
    expect(estUnJour('2026-02-31')).toBe(false);
    expect(estUnJour('2026-02-28')).toBe(true);
    expect(estUnJour('13/10/2026')).toBe(false);
  });

  it('compte les jours par-dessus un changement de mois', () => {
    expect(ecartEnJours('2026-01-31', '2026-02-01')).toBe(1);
    expect(decaler('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('tire la même question pour un couple et un jour, quel que soit l’ordre de la banque', () => {
    const a = choisirQuestionDuJour('c1', '2026-10-13', ['q1', 'q2', 'q3', 'q4']);
    const b = choisirQuestionDuJour('c1', '2026-10-13', ['q4', 'q3', 'q2', 'q1']);
    expect(a).toBe(b);
  });

  it('ne tire pas toujours la même question d’un jour à l’autre', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `q${i}`);
    const tirages = new Set(
      Array.from({ length: 20 }, (_, i) =>
        choisirQuestionDuJour('c1', decaler('2026-10-01', i), ids),
      ),
    );
    expect(tirages.size).toBeGreaterThan(5);
  });

  it('rend null sur une banque vide plutôt que d’inventer', () => {
    expect(choisirQuestionDuJour('c1', '2026-10-13', [])).toBeNull();
  });
});

describe('calculerSerie', () => {
  const T = '2026-10-13';

  it('zéro sans activité', () => {
    expect(calculerSerie([], T)).toEqual({
      actuelle: 0,
      record: 0,
      joueAujourdhui: false,
      enDanger: false,
    });
  });

  it('compte les jours consécutifs jusqu’à aujourd’hui', () => {
    const s = calculerSerie(['2026-10-11', '2026-10-12', '2026-10-13'], T);
    expect(s).toMatchObject({ actuelle: 3, record: 3, joueAujourdhui: true, enDanger: false });
  });

  it('une série jouée hier tient encore aujourd’hui', () => {
    const s = calculerSerie(['2026-10-11', '2026-10-12'], T);
    expect(s).toMatchObject({ actuelle: 2, joueAujourdhui: false, enDanger: false });
  });

  it('un seul jour manqué est rattrapé par la grâce, sans être compté', () => {
    const s = calculerSerie(['2026-10-10', '2026-10-11', '2026-10-13'], T);
    expect(s.actuelle).toBe(3);
  });

  it('la grâce ne sert qu’une fois par semaine', () => {
    // Grâce le 10/10 (le 9 manqué), puis le 12 manqué : trop tôt pour une seconde.
    const s = calculerSerie(['2026-10-08', '2026-10-10', '2026-10-11', '2026-10-13'], T);
    expect(s.actuelle).toBe(1);
    expect(s.record).toBe(3);
  });

  it('deux jours manqués cassent la série', () => {
    const s = calculerSerie(['2026-10-09', '2026-10-10'], T);
    expect(s.actuelle).toBe(0);
    expect(s.record).toBe(2);
  });

  it('avant-hier joué, hier manqué : la série tient mais vacille', () => {
    const s = calculerSerie(['2026-10-10', '2026-10-11'], T);
    expect(s).toMatchObject({ actuelle: 2, joueAujourdhui: false, enDanger: true });
  });

  it('hier joué mais grâce déjà prise : vacille, car demain il serait trop tard', () => {
    const s = calculerSerie(['2026-10-09', '2026-10-11', '2026-10-12'], T);
    expect(s).toMatchObject({ actuelle: 3, enDanger: true });
  });

  it('ignore un jour futur venu d’une horloge décalée', () => {
    const s = calculerSerie(['2026-10-12', '2026-10-14'], T);
    expect(s).toMatchObject({ actuelle: 1, joueAujourdhui: false });
  });

  it('déduplique les jours répétés', () => {
    expect(calculerSerie(['2026-10-13', '2026-10-13'], T).actuelle).toBe(1);
  });
});

describe('premierJourAtteignant', () => {
  it('date le jour où la série a atteint la longueur voulue', () => {
    const jours = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
    expect(premierJourAtteignant(jours, 3)).toBe('2026-10-03');
    expect(premierJourAtteignant(jours, 5)).toBeNull();
  });
});
