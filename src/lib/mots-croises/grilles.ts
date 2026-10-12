// Les grilles de mots croisés, et leurs définitions.
//
// ── Pourquoi ce fichier est écrit à la main ───────────────────────────────
//
// Une grille de mots croisés a besoin de DÉFINITIONS, pas de mots. Les seules
// données françaises qui en portent viennent du Wiktionnaire, en CC-BY-SA —
// copyleft, attribution obligatoire, et une question de partage à l'identique
// pour un produit commercial. Et même en l'acceptant, une définition de
// dictionnaire fait une mauvaise définition de mots croisés : trop technique,
// et elle contient souvent le mot lui-même.
//
// Les définitions ci-dessous sont donc écrites pour ce produit.
//
// ── Comment les mots ont été trouvés ─────────────────────────────────────
//
// Pas à la main : par recherche. Deux essais ont été nécessaires.
//
// Le premier cherchait des carrés de mots 5×5 — les cinq lignes ET les cinq
// colonnes formant des mots. Ça marche mécaniquement (six trouvés en une
// seconde) mais la contrainte est si dure qu'elle ne laisse passer que du
// vocabulaire inutilisable : « abats », « babil », « bagou », « agami ». Une
// grille qu'on n'a pas envie de remplir.
//
// Le second a ajouté quatre cases noires, ce qui relâche énormément la
// contrainte, et surtout a puisé dans une liste de mots COURANTS écrite à la
// main plutôt que dans le dictionnaire entier — un dictionnaire ne sait pas
// distinguer « fleur » de « agami ». D'où les grilles ci-dessous.
//
// ── La forme d'une grille ────────────────────────────────────────────────
//
// Cinq lignes sur cinq colonnes, quatre cases noires en (1,1), (1,3), (3,1)
// et (3,3) :
//
//     A I M E R        horizontaux : lignes 0, 2, 4
//     V # A # E        verticaux   : colonnes 0, 2, 4
//     R I R E S        les cases noires n'appartiennent à aucun mot
//     I # I # T
//     L E N T E
//
// Une grille est donc entièrement décrite par ses SIX mots. La matrice de
// lettres n'est pas stockée : elle se déduit, ce qui rend impossible qu'elle
// contredise les mots. Ce qui reste vérifiable — et vérifié par un test —
// c'est que les neuf croisements concordent : la 1re lettre du 1er vertical
// doit être la 1re lettre du 1er horizontal, et ainsi de suite. Une faute de
// frappe dans n'importe lequel des six mots casse un croisement.

/** Un mot de la grille, avec sa définition. */
export interface MotDeGrille {
  readonly mot: string;
  readonly definition: string;
}

/**
 * Une grille : trois mots horizontaux (lignes 0, 2, 4) et trois verticaux
 * (colonnes 0, 2, 4). Tous de cinq lettres, sans accent ni trait d'union —
 * la saisie se fait au clavier, lettre par lettre.
 */
export interface Grille {
  readonly id: string;
  readonly horizontaux: readonly [MotDeGrille, MotDeGrille, MotDeGrille];
  readonly verticaux: readonly [MotDeGrille, MotDeGrille, MotDeGrille];
}

export const GRILLES: readonly Grille[] = [
  {
    id: 'avril',
    horizontaux: [
      { mot: 'aimer', definition: 'Ce que vous faites depuis le premier jour.' },
      { mot: 'rires', definition: 'Ils éclatent quand la soirée est réussie.' },
      { mot: 'lente', definition: 'Qui prend son temps, comme une bonne soirée.' },
    ],
    verticaux: [
      { mot: 'avril', definition: 'Le mois des poissons et des giboulées.' },
      { mot: 'marin', definition: 'Il connaît la mer mieux que la terre.' },
      { mot: 'reste', definition: 'Ce qui demeure dans le plat après le dîner.' },
    ],
  },
  {
    id: 'ideal',
    horizontaux: [
      { mot: 'point', definition: 'Il termine la phrase.' },
      { mot: 'ouest', definition: 'Le soleil s’y couche.' },
      { mot: 'elles', definition: 'Le pronom du féminin pluriel.' },
    ],
    verticaux: [
      { mot: 'proie', definition: 'Ce que le chasseur poursuit.' },
      { mot: 'ideal', definition: 'Ce à quoi rien ne manque.' },
      { mot: 'tetes', definition: 'On en fait à deux quand on est têtu.' },
    ],
  },
  {
    id: 'lundi',
    horizontaux: [
      { mot: 'voler', definition: 'Ce que fait l’oiseau. Et le voleur.' },
      { mot: 'genou', definition: 'Entre la cuisse et le tibia.' },
      { mot: 'epice', definition: 'Elle relève le plat.' },
    ],
    verticaux: [
      { mot: 'vague', definition: 'Elle vient de la mer. Ou d’un souvenir flou.' },
      { mot: 'lundi', definition: 'Le jour qu’on aime le moins.' },
      { mot: 'route', definition: 'On la prend pour partir en week-end.' },
    ],
  },
  {
    id: 'appel',
    horizontaux: [
      { mot: 'appel', definition: 'On le passe quand l’autre manque.' },
      { mot: 'marin', definition: 'Son métier se fait loin des côtes.' },
      { mot: 'reste', definition: 'Ce qui subsiste.' },
    ],
    verticaux: [
      { mot: 'aimer', definition: 'Le verbe de toute cette application.' },
      { mot: 'parts', definition: 'On les partage : de gâteau, ou de bénéfices.' },
      { mot: 'lente', definition: 'Qui va sans se presser.' },
    ],
  },
  {
    id: 'sirop',
    horizontaux: [
      { mot: 'passe', definition: 'Le temps le fait, et on ne le retient pas.' },
      { mot: 'avril', definition: 'En ce mois, ne te découvre pas d’un fil.' },
      { mot: 'tapis', definition: 'Il couvre le sol du salon.' },
    ],
    verticaux: [
      { mot: 'plait', definition: 'S’il vous… : la formule de politesse.' },
      { mot: 'sirop', definition: 'Sucré, il colore l’eau du goûter.' },
      { mot: 'elles', definition: 'Elles sont plusieurs, et pas un seul homme.' },
    ],
  },
  {
    id: 'reine',
    horizontaux: [
      { mot: 'voler', definition: 'Prendre l’air. Ou prendre ce qui n’est pas à soi.' },
      { mot: 'dents', definition: 'La petite souris les collectionne.' },
      { mot: 'reine', definition: 'Elle règne. Aux échecs, elle va partout.' },
    ],
    verticaux: [
      { mot: 'vider', definition: 'Ce qu’on fait des poches avant la lessive.' },
      { mot: 'lundi', definition: 'Il suit le dimanche, hélas.' },
      { mot: 'reste', definition: 'Le résultat d’une soustraction.' },
    ],
  },
  {
    id: 'tasse',
    horizontaux: [
      { mot: 'point', definition: 'Ni virgule, ni point-virgule.' },
      { mot: 'idees', definition: 'On en a de bonnes, et de moins bonnes.' },
      { mot: 'salle', definition: 'Celle de bains, ou celle à manger.' },
    ],
    verticaux: [
      { mot: 'poids', definition: 'La balance l’indique.' },
      { mot: 'ideal', definition: 'Le rêve auquel on compare tout le reste.' },
      { mot: 'tasse', definition: 'Elle accueille le café du matin.' },
    ],
  },
  {
    id: 'larme',
    horizontaux: [
      { mot: 'appel', definition: 'Le professeur le fait chaque matin.' },
      { mot: 'roses', definition: 'On les offre en bouquet. Rouges, de préférence.' },
      { mot: 'larme', definition: 'Elle coule de joie autant que de peine.' },
    ],
    verticaux: [
      { mot: 'avril', definition: 'Après mars, avant mai.' },
      { mot: 'peser', definition: 'Ce qu’on fait de ses mots. Et de ses valises.' },
      { mot: 'liste', definition: 'Celle des courses, qu’on oublie à la maison.' },
    ],
  },
];
