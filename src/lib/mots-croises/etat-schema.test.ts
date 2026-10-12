import { describe, expect, it } from 'vitest';
import { parseEtatMotsCroises } from './etat-schema';
import { positionDepart } from './etat';

describe('validation de la forme de l’état', () => {
  it('accepte un état produit par le moteur', () => {
    const depart = positionDepart('avril');
    expect(parseEtatMotsCroises(JSON.parse(JSON.stringify(depart)))).toEqual(depart);
  });

  it('accepte un état avec des mots trouvés par les deux joueurs', () => {
    const etat = {
      idGrille: 'avril',
      trouves: [
        { direction: 'horizontal', index: 0, trouvePar: 'un' },
        { direction: 'vertical', index: 2, trouvePar: 'deux' },
      ],
      trait: 'un',
      passesConsecutifs: 0,
    };
    expect(parseEtatMotsCroises(etat)).toEqual(etat);
  });

  it('refuse une grille inconnue', () => {
    expect(
      parseEtatMotsCroises({
        idGrille: 'inexistante',
        trouves: [],
        trait: 'un',
        passesConsecutifs: 0,
      }),
    ).toBeNull();
  });

  it('refuse un joueur inconnu au trait', () => {
    expect(
      parseEtatMotsCroises({
        idGrille: 'avril',
        trouves: [],
        trait: 'trois',
        passesConsecutifs: 0,
      }),
    ).toBeNull();
  });

  it('refuse une direction qui n’est ni horizontal ni vertical', () => {
    expect(
      parseEtatMotsCroises({
        idGrille: 'avril',
        trouves: [{ direction: 'diagonal', index: 0, trouvePar: 'un' }],
        trait: 'un',
        passesConsecutifs: 0,
      }),
    ).toBeNull();
  });

  it('refuse un index hors de 0, 1, 2', () => {
    expect(
      parseEtatMotsCroises({
        idGrille: 'avril',
        trouves: [{ direction: 'horizontal', index: 3, trouvePar: 'un' }],
        trait: 'un',
        passesConsecutifs: 0,
      }),
    ).toBeNull();
  });

  it('refuse un même emplacement trouvé deux fois', () => {
    expect(
      parseEtatMotsCroises({
        idGrille: 'avril',
        trouves: [
          { direction: 'horizontal', index: 0, trouvePar: 'un' },
          { direction: 'horizontal', index: 0, trouvePar: 'deux' },
        ],
        trait: 'un',
        passesConsecutifs: 0,
      }),
    ).toBeNull();
  });

  it('refuse plus de six mots trouvés', () => {
    const trouves = [
      { direction: 'horizontal', index: 0, trouvePar: 'un' },
      { direction: 'horizontal', index: 1, trouvePar: 'un' },
      { direction: 'horizontal', index: 2, trouvePar: 'un' },
      { direction: 'vertical', index: 0, trouvePar: 'un' },
      { direction: 'vertical', index: 1, trouvePar: 'un' },
      { direction: 'vertical', index: 2, trouvePar: 'un' },
      { direction: 'horizontal', index: 0, trouvePar: 'deux' },
    ];
    expect(
      parseEtatMotsCroises({ idGrille: 'avril', trouves, trait: 'un', passesConsecutifs: 0 }),
    ).toBeNull();
  });

  it('refuse un compteur de passages hors de 0, 1, 2', () => {
    expect(
      parseEtatMotsCroises({ idGrille: 'avril', trouves: [], trait: 'un', passesConsecutifs: 3 }),
    ).toBeNull();
  });

  it('refuse un champ en plus, non déclaré', () => {
    expect(
      parseEtatMotsCroises({
        idGrille: 'avril',
        trouves: [],
        trait: 'un',
        passesConsecutifs: 0,
        score: { un: 3, deux: 1 },
      }),
    ).toBeNull();
  });

  it('accepte un mot trouvé même s’il n’appartient pas — à la forme — à une grille précise', () => {
    // Forme, pas légalité : chaque grille a exactement les mêmes six
    // emplacements (voir etat.ts), donc « appartenir à la grille » n'est
    // rien de plus que ce que DirectionSchema/IndexMotSchema vérifient déjà
    // — ce schéma ne sait pas, et n'a pas à savoir, si le MOT inscrit à cet
    // emplacement est réellement celui de `grilles.ts` : c'est `partie.ts`
    // qui en décide, jamais le serveur.
    expect(
      parseEtatMotsCroises({
        idGrille: 'ideal',
        trouves: [{ direction: 'horizontal', index: 0, trouvePar: 'un' }],
        trait: 'deux',
        passesConsecutifs: 0,
      }),
    ).not.toBeNull();
  });

  it('refuse ce qui n’est pas un objet', () => {
    expect(parseEtatMotsCroises(null)).toBeNull();
    expect(parseEtatMotsCroises('avril')).toBeNull();
    expect(parseEtatMotsCroises(42)).toBeNull();
  });
});
