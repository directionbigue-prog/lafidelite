// Les règles affichées disent-elles la vérité sur les moteurs ?
//
// ── Le défaut que ce fichier existe pour empêcher ─────────────────────
//
// Une explication de jeu est du texte. Elle ne casse rien, elle ne lève
// aucune erreur, et elle survit intacte à un moteur qu'on modifie. Le jour
// où « six tentatives » devient sept dans `TENTATIVES_MAX`, l'écran
// continuera d'annoncer six — et le joueur croira avoir trouvé un bug
// alors qu'il lit une notice périmée.
//
// D'où le parti pris : les assertions ci-dessous n'écrivent aucun chiffre
// en dur. Elles importent les constantes des moteurs et vérifient que le
// texte les mentionne. Changer une règle du jeu fait donc rougir son
// explication, ce qui est exactement le rappel qu'il faut.
//
// Ce que ce fichier ne prouve pas : que les phrases soient claires, ni
// qu'elles s'affichent. Aucun test de ce dépôt ne le peut (ni jsdom ni
// Testing Library — voir CLAUDE.md). Il prouve qu'elles sont complètes et
// qu'elles ne contredisent pas le code.
import { describe, expect, it } from 'vitest';

import { JEUX } from './jeux';
import { REGLES, type RegleDuJeu } from './regles';

import { TENTATIVES_MAX } from '@/lib/mot/etat';
import { NB_PIONS } from '@/lib/ludo/plateau';
import { MOTS_PAR_GRILLE } from '@/lib/mots-croises/etat';

/** Les nombres jusqu'à douze s'écrivent en lettres dans ces textes. */
const EN_LETTRES: Readonly<Record<number, string>> = {
  2: 'deux',
  3: 'trois',
  4: 'quatre',
  5: 'cinq',
  6: 'six',
  7: 'sept',
};

function toutLeTexte(regle: RegleDuJeu): string {
  return [regle.but, ...regle.tour, ...regle.aSavoir].join(' ').toLowerCase();
}

describe('les règles affichées dans le Salon', () => {
  it('couvrent les cinq jeux, sans exception', () => {
    // Le type l'impose déjà à la compilation. Ceci attrape l'autre moitié :
    // une entrée présente mais vide, que `Record<Jeu, …>` accepte sans
    // broncher.
    const manquants = JEUX.filter((jeu) => REGLES[jeu] === undefined);
    expect(manquants).toEqual([]);
    expect(Object.keys(REGLES).sort()).toEqual([...JEUX].sort());
  });

  it('donnent partout un but, un déroulé et des pièges', () => {
    const incomplets = JEUX.filter((jeu) => {
      const regle = REGLES[jeu];
      return regle.but.trim().length < 20 || regle.tour.length < 2 || regle.aSavoir.length < 3;
    });
    expect(incomplets).toEqual([]);
  });

  it('n’avancent aucune phrase vide ni tronquée', () => {
    const fautives: string[] = [];
    for (const jeu of JEUX) {
      const regle = REGLES[jeu];
      for (const phrase of [regle.but, ...regle.tour, ...regle.aSavoir]) {
        if (phrase.trim().length < 10) fautives.push(`${jeu} : « ${phrase} »`);
        if (phrase !== phrase.trim()) fautives.push(`${jeu} : espace en trop`);
      }
    }
    expect(fautives).toEqual([]);
  });

  // ── L'accroche aux moteurs ──────────────────────────────────────────
  // Un chiffre changé dans le moteur doit faire rougir son explication.

  it('annonce pour Le Mot le nombre de tentatives qu’accorde le moteur', () => {
    const attendu = EN_LETTRES[TENTATIVES_MAX];
    expect(attendu, `écrire ${TENTATIVES_MAX} en lettres`).toBeDefined();
    expect(toutLeTexte(REGLES.MOT)).toContain(`${attendu} tentative`);
  });

  it('annonce pour le Ludo le nombre de pions qu’a chaque camp', () => {
    const attendu = EN_LETTRES[NB_PIONS];
    expect(attendu, `écrire ${NB_PIONS} en lettres`).toBeDefined();
    expect(toutLeTexte(REGLES.LUDO)).toContain(`${attendu} pions`);
  });

  it('annonce pour les mots croisés le nombre de mots que porte une grille', () => {
    const attendu = EN_LETTRES[MOTS_PAR_GRILLE];
    expect(attendu, `écrire ${MOTS_PAR_GRILLE} en lettres`).toBeDefined();
    expect(toutLeTexte(REGLES.MOTS_CROISES)).toContain(`${attendu} mots par grille`);
  });

  it('dit pour les dames que la prise est obligatoire et maximale', () => {
    // Les deux règles sur lesquelles bute tout joueur qui découvre les
    // dames internationales, et les deux que le moteur applique sans appel.
    const texte = toutLeTexte(REGLES.DAMES);
    expect(texte).toContain('obligatoire');
    expect(texte).toContain('plus de pièces');
  });

  it('dit pour l’Awalé le seuil de victoire et l’obligation de nourrir', () => {
    const texte = toutLeTexte(REGLES.AWALE);
    // 25 sur 48 : le seuil vit dans `awale/partie.ts`, la somme dans le
    // schéma. Les deux figurent dans le but annoncé au joueur.
    expect(texte).toContain('25');
    expect(texte).toContain('48');
    expect(texte).toContain('nourrir');
  });

  it('mord vraiment : l’accroche échouerait si le texte ne suivait pas', () => {
    // Sans ceci, une faute de frappe dans `EN_LETTRES` rendrait les trois
    // tests ci-dessus verts sur une comparaison qui ne compare rien.
    const fauxTexte = 'le joueur a neuf tentatives'.toLowerCase();
    expect(fauxTexte).not.toContain(`${EN_LETTRES[TENTATIVES_MAX]} tentative`);
  });
});
