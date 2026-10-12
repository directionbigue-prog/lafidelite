import { describe, expect, it } from 'vitest';
import { coupsSimples } from './coups';
import { positionDepart, plateauVide, type EtatPlateau } from './etat';

describe('déplacements des pions', () => {
  it('offre exactement 9 coups depuis la position de départ', () => {
    // Valeur de référence : perft(1) = 9 depuis la position initiale.
    // Seule la rangée avancée des blancs (cases 31-35) peut bouger, et la
    // case 35, au bord, n'a qu'une diagonale libre : 2+2+2+2+1 = 9.
    expect(coupsSimples(positionDepart())).toHaveLength(9);
  });

  it('ne fait avancer un pion que vers le camp adverse', () => {
    const cases = plateauVide();
    cases[27] = { camp: 'blanc', dame: false }; // case 28, au centre
    const etat: EtatPlateau = { cases, trait: 'blanc' };
    // Les blancs montent : depuis 28, ce sont 22 et 23, jamais 32 ni 33.
    expect(
      coupsSimples(etat)
        .map((c) => c.arrivee)
        .sort((a, b) => a - b),
    ).toEqual([22, 23]);
  });

  it('ne traverse pas une case occupée', () => {
    const cases = plateauVide();
    cases[27] = { camp: 'blanc', dame: false }; // 28
    cases[21] = { camp: 'noir', dame: false }; // 22, devant à gauche
    const etat: EtatPlateau = { cases, trait: 'blanc' };
    expect(coupsSimples(etat).map((c) => c.arrivee)).toEqual([23]);
  });

  it('ne capture jamais : les coups simples n’ont ni prise ni palier', () => {
    for (const coup of coupsSimples(positionDepart())) {
      expect(coup.captures).toEqual([]);
      expect(coup.paliers).toEqual([]);
    }
  });
});

describe('déplacements des dames', () => {
  it('glisse sur toute la diagonale libre', () => {
    const cases = plateauVide();
    cases[27] = { camp: 'blanc', dame: true }; // dame en 28
    const etat: EtatPlateau = { cases, trait: 'blanc' };
    const arrivees = coupsSimples(etat)
      .map((c) => c.arrivee)
      .sort((a, b) => a - b);
    // Depuis 28, les quatre diagonales complètes sur un plateau par
    // ailleurs vide : 4 + 5 + 4 + 4 = 17 cases.
    expect(arrivees).toEqual([5, 6, 10, 11, 14, 17, 19, 22, 23, 32, 33, 37, 39, 41, 44, 46, 50]);
  });

  it("s'arrête juste avant une pièce, quelle que soit sa couleur", () => {
    const cases = plateauVide();
    cases[27] = { camp: 'blanc', dame: true }; // 28
    cases[21] = { camp: 'blanc', dame: false }; // 22 : bloque la diagonale
    const etat: EtatPlateau = { cases, trait: 'blanc' };
    // On isole les coups de la dame (depart 28) : le pion bloqueur en 22
    // est lui aussi au trait et a donc son propre coup légal vers 17, ce
    // qui n'a rien à voir avec le blocage de la dame qu'on vérifie ici.
    const coupsDeLaDame = coupsSimples(etat)
      .filter((c) => c.depart === 28)
      .map((c) => c.arrivee);
    expect(coupsDeLaDame).not.toContain(17);
    expect(coupsDeLaDame).not.toContain(22);
  });
});

describe('trait', () => {
  it("ne génère jamais les coups du camp qui n'est pas au trait", () => {
    const coups = coupsSimples({ ...positionDepart(), trait: 'noir' });
    // Les noirs occupent 1-20 et descendent : leur rangée avancée est 16-20.
    expect(coups.every((c) => c.depart >= 16 && c.depart <= 20)).toBe(true);
  });
});
