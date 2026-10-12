// Génération des coups.
//
// Trois couches, dans cet ordre : les déplacements simples (ici), les
// rafles (Tasks 4-5), puis l'arbitrage entre les deux (Task 6). La
// séparation est réelle : un déplacement simple n'est légal que s'il
// n'existe aucune prise, et c'est `coupsLegaux` — et lui seul — qui le
// décide.
import { DIRECTIONS, voisine, sensAvance } from './plateau';
import { type Camp, type Case, type Coup, type EtatPlateau, pieceEn } from './etat';

/** Déplacements sans prise du camp au trait. Ne dit rien de leur légalité. */
export function coupsSimples(etat: EtatPlateau): Coup[] {
  const coups: Coup[] = [];
  for (let depart = 1; depart <= etat.cases.length; depart += 1) {
    const piece = pieceEn(etat.cases, depart);
    if (piece === null || piece.camp !== etat.trait) continue;

    if (piece.dame) {
      for (const dir of DIRECTIONS) {
        // La dame glisse tant que la case suivante est libre, et s'arrête
        // sur la première pièce rencontrée — sans distinguer sa couleur :
        // on ne prend pas dans un déplacement simple.
        for (let d = 1; ; d += 1) {
          const arrivee = voisine(depart, dir, d);
          if (arrivee === null || pieceEn(etat.cases, arrivee) !== null) break;
          coups.push({ depart, arrivee, captures: [], paliers: [] });
        }
      }
      continue;
    }

    // Un pion n'avance que vers le camp adverse — contrairement à la
    // prise, qui se fait dans les quatre directions.
    const dr = sensAvance(piece.camp);
    for (const dir of DIRECTIONS) {
      if (dir.dr !== dr) continue;
      const arrivee = voisine(depart, dir);
      if (arrivee === null || pieceEn(etat.cases, arrivee) !== null) continue;
      coups.push({ depart, arrivee, captures: [], paliers: [] });
    }
  }
  return coups;
}

/** Vrai si `caseNum` porte une pièce du camp opposé à `camp`. */
export function estAdverse(cases: readonly Case[], caseNum: number, camp: Camp): boolean {
  const piece = pieceEn(cases, caseNum);
  return piece !== null && piece.camp !== camp;
}

/**
 * Toutes les séquences de prise du camp au trait, sans arbitrage.
 *
 * « Brutes » au sens strict : ni filtre de rafle maximale, ni
 * déduplication. Task 6 s'en charge — séparer la génération de l'arbitrage
 * est ce qui rend les deux testables.
 */
export function raflesBrutes(etat: EtatPlateau): Coup[] {
  const coups: Coup[] = [];
  for (let depart = 1; depart <= etat.cases.length; depart += 1) {
    const piece = pieceEn(etat.cases, depart);
    if (piece === null || piece.camp !== etat.trait) continue;

    // La pièce qui rafle est retirée de sa case de départ pour toute la
    // durée de la recherche. Sa case d'origine devient donc un
    // atterrissage possible — ce qui arrive dans les rafles circulaires, et
    // qu'on manquerait en la laissant en place.
    const travail = [...etat.cases];
    travail[depart - 1] = null;

    explorer(travail, piece.camp, piece.dame, depart, depart, [], [], coups);
  }
  return coups;
}

/**
 * Poursuit une rafle depuis `position`, en profondeur.
 *
 * `capturees` porte les cases des pièces déjà prises **dans cette
 * séquence**. Elles restent physiquement sur `cases` : elles ne peuvent
 * plus être reprises, mais elles bloquent toujours le passage. C'est cette
 * distinction — prise mais présente — qui interdit de sauter deux fois la
 * même pièce, et sans elle le générateur invente des rafles impossibles.
 */
function explorer(
  cases: readonly Case[],
  camp: Camp,
  dame: boolean,
  depart: number,
  position: number,
  capturees: readonly number[],
  paliers: readonly number[],
  sortie: Coup[],
): void {
  let prolongee = false;

  for (const dir of DIRECTIONS) {
    if (dame) {
      // Une dame glisse jusqu'à la première pièce rencontrée.
      // Nommée `victimeDame` et non `victime` pour ne pas masquer la
      // variable du bloc voisin — ESLint refuse le doublon.
      let distance = 1;
      let victimeDame: number | null = null;
      for (; ; distance += 1) {
        const sq = voisine(position, dir, distance);
        if (sq === null) break;
        if (pieceEn(cases, sq) === null) continue;
        // Première pièce sur la diagonale. Elle n'est franchissable que si
        // elle est adverse ET pas déjà prise dans cette rafle — une pièce
        // déjà capturée reste un bloqueur.
        if (estAdverse(cases, sq, camp) && !capturees.includes(sq)) victimeDame = sq;
        break;
      }
      if (victimeDame === null) continue;

      // Chaque case libre au-delà de la victime est un atterrissage
      // possible, et chacune ouvre des continuations différentes. C'est
      // pour cela que l'exploration branche ici et pas seulement sur la
      // pièce prise.
      for (let apres = distance + 1; ; apres += 1) {
        const atterrissage = voisine(position, dir, apres);
        if (atterrissage === null || pieceEn(cases, atterrissage) !== null) break;
        prolongee = true;
        explorer(
          cases,
          camp,
          dame,
          depart,
          atterrissage,
          [...capturees, victimeDame],
          [...paliers, atterrissage],
          sortie,
        );
      }
      continue;
    }

    // Un pion prend dans les quatre directions — en avant comme en
    // arrière. Seul son déplacement simple est orienté.
    const victime = voisine(position, dir);
    const atterrissage = voisine(position, dir, 2);
    if (victime === null || atterrissage === null) continue;
    if (!estAdverse(cases, victime, camp)) continue;
    if (capturees.includes(victime)) continue;
    if (pieceEn(cases, atterrissage) !== null) continue;

    prolongee = true;
    explorer(
      cases,
      camp,
      dame,
      depart,
      atterrissage,
      [...capturees, victime],
      [...paliers, atterrissage],
      sortie,
    );
  }

  // Une rafle se termine quand plus aucune prise ne la prolonge. Le
  // dernier palier est la case d'arrivée, pas un palier.
  if (!prolongee && capturees.length > 0) {
    sortie.push({
      depart,
      arrivee: position,
      captures: [...capturees].sort((a, b) => a - b),
      paliers: paliers.slice(0, -1),
    });
  }
}

/**
 * Les coups légaux du camp au trait — la seule fonction de génération que
 * l'interface doit connaître.
 *
 * Trois règles s'appliquent dans cet ordre : la prise est obligatoire, la
 * rafle maximale l'emporte, et les rafles qui ne diffèrent que par l'ordre
 * des prises sont le même coup.
 */
export function coupsLegaux(etat: EtatPlateau): Coup[] {
  const rafles = raflesBrutes(etat);
  if (rafles.length === 0) return coupsSimples(etat);

  // La règle compte le NOMBRE de pièces, jamais leur valeur : une dame ne
  // vaut pas plus qu'un pion. (La variante italienne dit l'inverse — s'en
  // inspirer ici serait un bug silencieux.)
  const maximum = Math.max(...rafles.map((r) => r.captures.length));
  const maximales = rafles.filter((r) => r.captures.length === maximum);

  // Deux rafles de même départ, même arrivée et même ensemble de prises
  // sont le MÊME coup, quel que soit le chemin suivi. Le doublon a deux
  // origines distinctes, et toutes deux se déclenchent dès DEUX captures :
  //   - l'ordre des prises, dans une rafle qui referme une boucle (une
  //     dame qui prend A puis B, ou B puis A, pour revenir sur la même
  //     case de départ) ;
  //   - le choix de la case d'atterrissage d'une dame volante après une
  //     prise, quand deux atterrissages différents mènent, via des prises
  //     suivantes différentes, à la même arrivée finale avec le même
  //     ensemble de captures — sans qu'aucun ordre ne soit permuté.
  // Exemple concret de ce second cas : dame blanche en 1, pions noirs en 7
  // et 23 ; les paliers [12] et [18] mènent chacun, pour une même case
  // d'arrivée finale (29, 34, 40 ou 45), aux mêmes deux captures {7, 23} —
  // quatre doublons, un par arrivée possible. C'est exactement là que deux
  // générateurs de référence divergent au perft(8). Sans ce filtre,
  // l'interface proposerait au joueur deux destinations identiques et
  // indiscernables.
  const vues = new Set<string>();
  const uniques: Coup[] = [];
  for (const rafle of maximales) {
    const cle = `${rafle.depart}-${rafle.arrivee}-${rafle.captures.join(',')}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    uniques.push(rafle);
  }
  return uniques;
}
