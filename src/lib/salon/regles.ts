// Comment on joue, pour les cinq jeux du Salon.
//
// ── Pourquoi ce fichier est du TEXTE et pas du JSX ────────────────────
//
// Ce dépôt n'a ni jsdom ni Testing Library : rien ne peut être monté, donc
// rien de ce qui vit dans du JSX n'est vraiment vérifiable (voir
// CLAUDE.md). En gardant les règles comme données, ce qui compte devient
// testable pour de vrai — que les cinq jeux soient couverts, qu'aucun
// texte ne soit vide, que les chiffres annoncés soient ceux du moteur.
//
// ── Pourquoi un Record indexé sur `Jeu` ───────────────────────────────
//
// Le type force l'exhaustivité : ajouter un sixième jeu à `JEUX` casse le
// typecheck tant que ses règles ne sont pas écrites. C'est la même garde
// que `jeux.ts` applique à `etatInitial` et `parseEtat` — et elle vaut
// autant ici, parce qu'un jeu livré sans explication ne casse rien et ne
// se voit pas.
//
// ── D'où viennent ces textes ──────────────────────────────────────────
//
// Des moteurs, pas de la culture générale. Chaque règle de la rubrique
// « à savoir » a été relue dans le code avant d'être écrite : la prise
// maximale des dames compte les PIÈCES et non leur valeur, l'Awalé
// autorise la prise qui vide le camp adverse (règle ouest-africaine
// classique, pas Abapa), le Ludo exige le compte exact à l'arrivée. Une
// explication qui contredit le moteur est pire que pas d'explication : le
// joueur croit avoir trouvé un bug.
import type { Jeu } from './jeux';

export interface RegleDuJeu {
  /** Ce qu'il faut accomplir, en une phrase. */
  readonly but: string;
  /** Le déroulé d'un tour, dans l'ordre. */
  readonly tour: readonly string[];
  /**
   * Les règles qui surprennent. C'est la rubrique qui justifie l'existence
   * de ce fichier : personne n'a besoin qu'on lui dise qu'un pion avance,
   * mais tout le monde bute sur la prise obligatoire ou sur le six
   * nécessaire pour sortir de l'enclos.
   */
  readonly aSavoir: readonly string[];
}

export const REGLES: Readonly<Record<Jeu, RegleDuJeu>> = {
  DAMES: {
    but: 'Prendre toutes les pièces de votre partenaire, ou le priver de tout coup.',
    tour: [
      'Touchez une de vos pièces : ses destinations s’allument.',
      'Touchez la case d’arrivée pour préparer le coup.',
      'Validez — ou annulez tant que le coup n’est pas joué.',
    ],
    aSavoir: [
      'La prise est obligatoire : s’il existe une prise, aucun autre coup ne vous est proposé.',
      'On prend en avant comme en arrière, et on enchaîne tant que la rafle continue.',
      'Quand plusieurs rafles sont possibles, il faut prendre le plus de pièces. C’est le nombre qui compte, jamais la valeur — une rafle de trois pions passe avant une rafle d’une dame.',
      'Un pion devient dame s’il TERMINE son coup sur la dernière rangée. S’il ne fait qu’y passer au milieu d’une rafle, il reste pion.',
      'La dame glisse sur toute la diagonale et prend de loin.',
      'Les pièces prises ne quittent le plateau qu’à la fin de la rafle : on ne peut pas repasser deux fois sur la même.',
    ],
  },

  AWALE: {
    but: 'Récolter 25 graines sur les 48 que compte le plateau.',
    tour: [
      'Choisissez un de vos trous, à condition qu’il ne soit pas vide.',
      'Toutes ses graines en sortent et se sèment une par une dans les trous suivants, toujours dans le même sens.',
      'Si la dernière graine tombe dans un trou de votre partenaire et le porte à 2 ou 3 graines, vous les prenez.',
    ],
    aSavoir: [
      'Après une prise, on remonte : le trou précédent est pris aussi s’il appartient à votre partenaire et contient lui aussi 2 ou 3 graines.',
      'Un semis assez long pour faire le tour complet saute son propre trou de départ.',
      'Si votre partenaire n’a plus une seule graine, vous devez jouer un coup qui lui en redonne. C’est la règle qui interdit de gagner en affamant l’autre.',
      'Si aucun coup ne peut le nourrir, la partie s’arrête : chacun récolte les graines restées de son côté.',
      'Une prise qui vide entièrement le camp d’en face est autorisée ici. C’est la règle ouest-africaine classique ; les règles de tournoi l’interdisent.',
      '24 graines partout : la partie est nulle.',
    ],
  },

  LUDO: {
    but: 'Amener vos quatre pions à l’arrivée avant votre partenaire.',
    tour: [
      'Lancez le dé.',
      'Choisissez le pion à déplacer : chaque coup possible vous est proposé en toutes lettres.',
    ],
    aSavoir: [
      'Il faut un six pour sortir un pion de l’enclos.',
      'Un six rejoue. Mais trois six d’affilée annulent le tour.',
      'Terminer son déplacement sur un pion adverse le renvoie dans son enclos.',
      'Les deux cases d’entrée sont sûres : un pion qui s’y trouve ne peut pas être pris.',
      'Une prise ne donne pas de tour supplémentaire.',
      'Il faut le compte exact pour atteindre l’arrivée. Un dé trop grand rend le coup impossible pour ce pion — jouez-en un autre.',
      'Si aucun coup n’est possible, la main passe. Cela arrive souvent.',
    ],
  },

  MOT: {
    but: 'Deviner le mot de votre partenaire en moins de tentatives qu’il n’en met à deviner le vôtre.',
    tour: [
      'L’un de vous saisit un mot de cinq lettres, puis passe l’appareil.',
      'L’autre a six tentatives pour le trouver.',
      'Après chaque tentative, chaque lettre est marquée.',
      'Puis les rôles s’échangent pour une seconde manche.',
    ],
    aSavoir: [
      '✓ la lettre est bien placée · ≈ elle est dans le mot, mais ailleurs · · elle n’y est pas.',
      'Une tentative qui n’est pas un mot du dictionnaire est refusée sans vous coûter d’essai.',
      'Celui qui a trouvé en moins de tentatives l’emporte. À égalité — ou si aucun des deux ne trouve — la partie est nulle.',
    ],
  },

  MOTS_CROISES: {
    but: 'Trouver plus de mots que votre partenaire dans la grille.',
    tour: [
      'Choisissez une définition encore sans réponse.',
      'Proposez un mot de cinq lettres.',
      'Juste, il s’inscrit dans la grille et vous est compté. Faux, rien ne s’inscrit.',
    ],
    aSavoir: [
      'Dans les deux cas la main passe. L’alternance est stricte : chacun a exactement le même nombre de tentatives.',
      'Les lettres déjà posées servent pour les mots suivants — c’est tout l’intérêt des croisements.',
      'Vous pouvez passer votre tour. Si vous passez tous les deux coup sur coup, la partie s’arrête.',
      'Six mots par grille. Celui qui en a trouvé le plus gagne ; à égalité, la partie est nulle.',
    ],
  },
};
