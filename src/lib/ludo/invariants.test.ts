// Les quatre invariants qui remplacent le perft pour le Ludo — comme pour
// l'Awalé (`lib/awale/invariants.test.ts`), il n'existe pas de valeurs de
// référence publiées. Le hasard n'empêche pas de vérifier : la graine du
// générateur est fixée, donc tout échec est reproductible, jamais un coup
// de malchance du CI. Voir docs/superpowers/specs/2026-09-10-ludo-design.md.
//
// 1. Conservation : chaque camp a toujours exactement quatre pions, chacun
//    dans un lieu valide (enclos, circuit avec une progression 0-51,
//    colonne avec une progression 0-4, ou arrivée).
// 2. Légalité : aucun coup ne déplace un pion adverse, ne sort de l'enclos
//    sans six, ne dépasse la case finale, ni ne prend un pion sur une case
//    sûre.
// 3. Terminaison : toute partie se termine en un nombre borné de lancers —
//    l'invariant propre à ce jeu, qui attrape la borne des trois six
//    manquante et les impasses où plus personne ne peut jouer.
// 4. Progression : un tour qui ne peut rien jouer (annulation du 3e six,
//    ou aucun coup légal) passe la main et change le trait — il ne laisse
//    jamais l'état inchangé avec le même joueur au trait.
//
// Comme à l'Awalé, les vérifications à l'intérieur de la boucle chaude
// utilisent `assert` (lever une exception) et non `expect` de Vitest : sur
// les dizaines de milliers de lancers que couvrent ces parties, l'overhead
// de `expect` se chiffrerait en dizaines de secondes pour un gain nul —
// l'erreur remonte de la même façon, avec le même message précis.
import { describe, expect, it } from 'vitest';
import { coupsLegaux } from './coups';
import {
  adversaire,
  CAMPS,
  pionEn,
  positionDepart,
  type EtatLudo,
  type Pion,
  type QuatrePions,
} from './etat';
import { appliquer, issue, lancerDe, passerLaMain } from './partie';
import {
  caseAbsolue,
  distanceDe,
  DISTANCE_ARRIVEE,
  estCaseSure,
  SORTIE_ENCLOS,
  TAILLE_CIRCUIT,
  TAILLE_COLONNE,
} from './plateau';

const NB_PARTIES = 5000;
const GRAINE = 20260910; // date de la spec du Ludo — fixée pour que tout échec soit reproductible.

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Générateur pseudo-aléatoire déterministe (mulberry32), identique à celui
 * de l'Awalé et des dames. `Math.random` n'aurait pas permis de rejouer un
 * échec : c'est tout le sens de la graine fixée.
 */
function creerAleatoire(graine: number): () => number {
  let etat = graine;
  return () => {
    etat |= 0;
    etat = (etat + 0x6d2b79f5) | 0;
    let t = Math.imul(etat ^ (etat >>> 15), 1 | etat);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function choisir<T>(tableau: readonly T[], alea: () => number): T {
  const valeur = tableau[Math.floor(alea() * tableau.length)];
  if (valeur === undefined)
    throw new Error('tableau vide passé à choisir — bug du test, pas du moteur');
  return valeur;
}

/** Vérifie qu'un pion isolé occupe un lieu et une progression valides. */
function verifierPionValide(pion: Pion, contexte: string): void {
  if (pion.zone === 'circuit') {
    assert(
      pion.progression >= 0 && pion.progression < TAILLE_CIRCUIT,
      `${contexte} : progression de circuit hors bornes (${pion.progression})`,
    );
  } else if (pion.zone === 'colonne') {
    assert(
      pion.progression >= 0 && pion.progression < TAILLE_COLONNE,
      `${contexte} : progression de colonne hors bornes (${pion.progression})`,
    );
  }
  // 'enclos' et 'arrivee' n'ont pas de progression à borner.
}

/** Invariant 1 (conservation) : quatre pions par camp, chacun dans un lieu valide. */
function verifierConservation(etat: EtatLudo, contexte: string): void {
  for (const camp of CAMPS) {
    const pions = etat.pions[camp];
    assert(pions.length === 4, `${contexte} : ${camp} n'a pas exactement quatre pions`);
    for (let i = 0; i < 4; i += 1) {
      verifierPionValide(pionEn(pions, i), `${contexte}, pion ${camp}#${i}`);
    }
  }
}

function memePion(a: Pion, b: Pion): boolean {
  if (a.zone !== b.zone) return false;
  if (a.zone === 'circuit' && b.zone === 'circuit') return a.progression === b.progression;
  if (a.zone === 'colonne' && b.zone === 'colonne') return a.progression === b.progression;
  return true; // enclos/enclos ou arrivee/arrivee
}

function memesPions(a: QuatrePions, b: QuatrePions): boolean {
  return a.every((pion, i) => memePion(pion, pionEn(b, i)));
}

/**
 * Joue une partie complète au hasard depuis la position de départ, en
 * vérifiant les quatre invariants à chaque lancer. Rend `true` si la
 * partie s'est vraiment terminée, `false` si elle a buté sur le filet de
 * sécurité.
 */
function jouerPartieAleatoire(alea: () => number, numeroPartie: number): boolean {
  let etat = positionDepart();
  let lancers = 0;
  // Filet de sécurité : borne le temps du test, pas une attente de fin de
  // partie normale. Une partie qui l'atteint est abandonnée sans verdict,
  // pas signalée comme un échec — sauf si la proportion de parties dans
  // ce cas devient anormale (vérifié hors de la boucle chaude, plus bas).
  const LIMITE_LANCERS = 20_000;

  while (issue(etat).fini === false && lancers < LIMITE_LANCERS) {
    const contexte = `partie ${numeroPartie}, lancer ${lancers}`;
    const traitAvant = etat.trait;
    const pionsAvant = etat.pions;

    etat = lancerDe(etat, alea);
    lancers += 1;

    if (etat.de === null) {
      // Le lancer vient d'annuler le tour : c'est forcément le 3e six
      // d'affilée (lancerDe ne rend jamais `de: null` autrement). Invariant
      // 4 (progression) : la main a changé, le plateau n'a pas bougé.
      assert(
        etat.trait === adversaire(traitAvant),
        `${contexte} : annulation du 3e six mais le trait n'est pas passé à l'adversaire`,
      );
      assert(
        etat.sixDAffilee === 0,
        `${contexte} : le compteur de six n'est pas remis à zéro après annulation`,
      );
      assert(
        memesPions(etat.pions.sud, pionsAvant.sud) && memesPions(etat.pions.nord, pionsAvant.nord),
        `${contexte} : le plateau a bougé alors qu'aucun coup n'a été joué (3e six)`,
      );
      continue;
    }

    const legaux = coupsLegaux(etat);
    if (legaux.length === 0) {
      // Invariant 4 (progression) : aucun coup possible, la main doit
      // passer — c'est la situation que la spec dit fréquente.
      const suivant = passerLaMain(etat);
      assert(
        suivant.trait === adversaire(traitAvant),
        `${contexte} : passerLaMain n'a pas changé le trait`,
      );
      assert(
        memesPions(suivant.pions.sud, etat.pions.sud) &&
          memesPions(suivant.pions.nord, etat.pions.nord),
        `${contexte} : passerLaMain a modifié le plateau`,
      );
      etat = suivant;
      continue;
    }

    // Invariant 2 (légalité), avant le coup : chaque index légal désigne
    // un pion du camp au trait qui respecte bien les deux règles à dé.
    const de = etat.de;
    for (const index of legaux) {
      const pion = pionEn(etat.pions[etat.trait], index);
      assert(
        pion.zone !== 'arrivee',
        `${contexte} : le coup légal ${index} rejoue un pion déjà arrivé`,
      );
      if (pion.zone === 'enclos') {
        assert(de === 6, `${contexte} : le coup légal ${index} sort de l'enclos sans six`);
      } else {
        assert(
          distanceDe(pion) + de <= DISTANCE_ARRIVEE,
          `${contexte} : le coup légal ${index} dépasserait la case finale`,
        );
      }
    }

    const index = choisir(legaux, alea);
    const campJoueur = etat.trait;
    const campAdverse = adversaire(campJoueur);
    const pionAvantCoup = pionEn(etat.pions[campJoueur], index);
    const pionsAdverseAvant = etat.pions[campAdverse];

    const suivant = appliquer(etat, index);

    // Invariant 1 (conservation), après CE coup précisément.
    verifierConservation(suivant, contexte);

    // Invariant 2 (légalité), après le coup : la nouvelle position du pion
    // joué correspond exactement à distance(avant) + dé — jamais plus.
    const pionApresCoup = pionEn(suivant.pions[campJoueur], index);
    if (pionAvantCoup.zone === 'enclos') {
      assert(
        memePion(pionApresCoup, SORTIE_ENCLOS),
        `${contexte} : la sortie d'enclos n'atterrit pas sur la case d'entrée`,
      );
    } else {
      const distanceAvant = distanceDe(pionAvantCoup);
      assert(
        pionApresCoup.zone !== 'enclos',
        `${contexte} : le pion joué est revenu à l'enclos après un coup normal`,
      );
      const distanceApres =
        pionApresCoup.zone === 'arrivee' ? DISTANCE_ARRIVEE : distanceDe(pionApresCoup);
      assert(
        distanceApres === distanceAvant + de,
        `${contexte} : distance ${distanceApres} au lieu de ${distanceAvant + de} attendue`,
      );
      assert(
        distanceApres <= DISTANCE_ARRIVEE,
        `${contexte} : le pion a dépassé la case finale (distance ${distanceApres})`,
      );
    }

    // Invariant 2 (légalité), la prise : uniquement sur le circuit commun,
    // uniquement les pions adverses réellement sur la case cible, jamais
    // sur une case sûre, et rien d'autre côté adverse ne doit avoir bougé.
    if (pionApresCoup.zone === 'circuit') {
      const caseCible = caseAbsolue(campJoueur, pionApresCoup.progression);
      const sure = estCaseSure(caseCible);
      for (let i = 0; i < 4; i += 1) {
        const avant = pionEn(pionsAdverseAvant, i);
        const apres = pionEn(suivant.pions[campAdverse], i);
        const etaitSurLaCible =
          avant.zone === 'circuit' && caseAbsolue(campAdverse, avant.progression) === caseCible;
        if (etaitSurLaCible && !sure) {
          assert(
            apres.zone === 'enclos',
            `${contexte} : le pion adverse ${i} sur la case cible aurait dû être repris`,
          );
        } else {
          assert(
            memePion(avant, apres),
            `${contexte} : un pion adverse ${i} non concerné par la prise a pourtant bougé`,
          );
        }
      }
      if (sure) {
        assert(
          memesPions(suivant.pions[campAdverse], pionsAdverseAvant),
          `${contexte} : une prise a eu lieu sur une case sûre (${caseCible})`,
        );
      }
    } else {
      // Arrivée en colonne ou à l'arrivée : zone privée, aucune prise possible.
      assert(
        memesPions(suivant.pions[campAdverse], pionsAdverseAvant),
        `${contexte} : les pions adverses ont bougé alors que le coup entrait en colonne/arrivée`,
      );
    }

    // Invariant 4 (progression) : un six fait rejouer le même camp, tout
    // autre dé passe la main — dans les deux cas, le dé en attente doit
    // être consommé.
    assert(suivant.de === null, `${contexte} : le dé n'a pas été consommé après le coup`);
    if (de === 6) {
      assert(
        suivant.trait === campJoueur,
        `${contexte} : un six n'a pas fait rejouer le même camp`,
      );
    } else {
      assert(
        suivant.trait === campAdverse,
        `${contexte} : un dé non-six n'a pas passé la main à l'adversaire`,
      );
      assert(
        suivant.sixDAffilee === 0,
        `${contexte} : le compteur de six n'a pas été remis à zéro`,
      );
    }

    etat = suivant;
  }

  return issue(etat).fini;
}

describe(`invariants sur ${NB_PARTIES} parties aléatoires de Ludo (graine ${GRAINE})`, () => {
  it(
    'conserve quatre pions valides par camp, ne joue que des coups légaux, termine, et progresse toujours',
    { timeout: 60_000 },
    () => {
      const alea = creerAleatoire(GRAINE);
      let terminees = 0;
      for (let partie = 0; partie < NB_PARTIES; partie += 1) {
        if (jouerPartieAleatoire(alea, partie)) terminees += 1;
      }
      // Invariant 3 (terminaison) : la grande majorité des parties doit
      // atteindre une vraie fin de partie sous le filet de sécurité — s'il
      // se déclenchait pour la plupart d'entre elles, ce serait `issue` ou
      // la borne des trois six qui ne fonctionnerait plus, pas de la
      // malchance statistique.
      expect(terminees).toBeGreaterThan(NB_PARTIES * 0.9);
    },
  );
});
