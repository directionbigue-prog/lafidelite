import { describe, expect, it } from 'vitest';
import { appliquer, issue } from './partie';
import { coupsLegaux } from './coups';
import { positionDepart, plateauVide, pieceEn, type Case, type EtatPlateau } from './etat';

function etatAvec(
  placements: readonly [caseNum: number, camp: 'blanc' | 'noir', dame?: boolean][],
  trait: 'blanc' | 'noir',
): EtatPlateau {
  const cases: Case[] = plateauVide();
  for (const [caseNum, camp, dame = false] of placements) {
    cases[caseNum - 1] = { camp, dame };
  }
  return { cases, trait };
}

describe('application d’un coup', () => {
  it('déplace la pièce et passe le trait', () => {
    const depart = positionDepart();
    const apres = appliquer(depart, { depart: 33, arrivee: 28, captures: [], paliers: [] });
    expect(pieceEn(apres.cases, 33)).toBeNull();
    expect(pieceEn(apres.cases, 28)).toEqual({ camp: 'blanc', dame: false });
    expect(apres.trait).toBe('noir');
  });

  it('retire toutes les pièces capturées', () => {
    const etat = etatAvec(
      [
        [33, 'blanc'],
        [28, 'noir'],
        [17, 'noir'],
      ],
      'blanc',
    );
    const apres = appliquer(etat, { depart: 33, arrivee: 11, captures: [17, 28], paliers: [22] });
    expect(pieceEn(apres.cases, 28)).toBeNull();
    expect(pieceEn(apres.cases, 17)).toBeNull();
  });

  it('ne modifie jamais l’état reçu', () => {
    const depart = positionDepart();
    appliquer(depart, { depart: 33, arrivee: 28, captures: [], paliers: [] });
    expect(pieceEn(depart.cases, 33)).toEqual({ camp: 'blanc', dame: false });
  });
});

describe('promotion', () => {
  it('promeut un pion qui s’arrête sur la rangée du fond', () => {
    const etat = etatAvec([[7, 'blanc']], 'blanc');
    const apres = appliquer(etat, { depart: 7, arrivee: 1, captures: [], paliers: [] });
    expect(pieceEn(apres.cases, 1)).toEqual({ camp: 'blanc', dame: true });
  });

  it('ne promeut pas un pion qui n’y fait que passer', () => {
    // 13 saute 8, se pose en 2 — sur la rangée de promotion — puis repart
    // en arrière sauter 7 et finit en 11. Il a touché le fond sans s'y
    // arrêter : il reste un pion. C'est LE test qui sépare « promu en vol »
    // de « promu à l'arrivée », et le bug le plus courant du domaine.
    const etat = etatAvec(
      [
        [13, 'blanc'],
        [8, 'noir'],
        [7, 'noir'],
      ],
      'blanc',
    );
    const rafle = coupsLegaux(etat).find((c) => c.captures.length === 2);
    expect(rafle).toBeDefined();
    if (rafle === undefined) return;
    expect(rafle.arrivee).toBe(11);
    const apres = appliquer(etat, rafle);
    expect(pieceEn(apres.cases, 11)).toEqual({ camp: 'blanc', dame: false });
  });

  it('laisse une dame dame', () => {
    const etat = etatAvec([[7, 'blanc', true]], 'blanc');
    const apres = appliquer(etat, { depart: 7, arrivee: 12, captures: [], paliers: [] });
    expect(pieceEn(apres.cases, 12)?.dame).toBe(true);
  });
});

describe('fin de partie', () => {
  it('ne déclare rien tant qu’un coup reste possible', () => {
    expect(issue(positionDepart())).toEqual({ fini: false });
  });

  it('fait perdre le camp qui n’a plus de pièces', () => {
    expect(issue(etatAvec([[28, 'noir']], 'blanc'))).toEqual({ fini: true, vainqueur: 'noir' });
  });

  it('fait perdre le camp bloqué, même s’il lui reste des pièces', () => {
    // La case 46 est dans le coin : sa seule voisine est 41, et le seul
    // atterrissage derrière 41 est 37. Deux pions noirs sur ces deux cases
    // suffisent donc à enfermer complètement le pion blanc — il ne peut ni
    // avancer (41 occupée) ni prendre (37 occupée).
    //
    // Un seul pion blanc sur le damier, délibérément : toute pièce blanche
    // supplémentaire rendrait au camp une mobilité, et le test ne
    // prouverait plus rien.
    const bloque = etatAvec(
      [
        [46, 'blanc'],
        [41, 'noir'],
        [37, 'noir'],
      ],
      'blanc',
    );
    expect(issue(bloque)).toEqual({ fini: true, vainqueur: 'noir' });
  });
});
