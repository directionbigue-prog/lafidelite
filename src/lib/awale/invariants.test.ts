// Les trois invariants qui remplacent le perft pour l'Awalé — il n'existe
// pas de valeurs de référence publiées comme pour les dames (voir la spec,
// docs/superpowers/specs/2026-09-09-awale-design.md). Éprouvés sur des
// milliers de parties jouées au hasard, avec une graine de générateur
// fixée : un échec est reproductible, jamais un coup de malchance du CI.
//
// 1. Conservation : la somme des douze trous et des deux greniers vaut
//    toujours 48, après chaque coup, récolte finale comprise.
// 2. Légalité : aucun coup ne part d'un trou vide ni d'un trou adverse, et
//    aucun trou ne devient négatif.
// 3. Nourrissage : quand l'adversaire est à zéro et qu'un coup nourrissant
//    existe, tout coup légal lui en donne au moins une ; quand aucun
//    n'existe, la partie se termine par la récolte.
//
// Les vérifications à l'intérieur de la boucle de simulation utilisent
// `assert` (lever une exception), pas `expect` de Vitest : sur les
// ~440 000 coups que couvrent quelques milliers de parties, l'overhead des
// assertions Vitest se chiffre en minutes (mesuré : plus de 200s), contre
// une fraction de seconde pour un simple test JS suivi d'un `throw`. Le
// résultat sur l'échec est identique — l'erreur remonte, le test rougit,
// le message dit précisément quel coup et quelle partie ont trahi
// l'invariant. `expect` reste utilisé hors de la boucle chaude, où le
// nombre d'appels est borné par le nombre de parties, pas par le nombre de
// coups.
import { describe, expect, it } from 'vitest';
import { coupsLegaux, nourrit, sommeCote } from './coups';
import { appliquer, issue } from './partie';
import {
  adversaire,
  campDuTrou,
  grainesEn,
  NB_TROUS,
  positionDepart,
  type EtatAwale,
} from './etat';

const NB_PARTIES = 3000;
const GRAINE = 20260909; // date de la spec — fixée pour que tout échec soit reproductible.

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Générateur pseudo-aléatoire déterministe (mulberry32). `Math.random`
 * n'aurait pas permis de rejouer un échec : c'est tout le sens de la
 * graine fixée demandée par la tâche.
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

function sommeTotale(etat: EtatAwale): number {
  let somme = etat.greniers.sud + etat.greniers.nord;
  for (let trou = 0; trou < NB_TROUS; trou += 1) somme += grainesEn(etat.trous, trou);
  return somme;
}

/**
 * Choisit un élément au hasard dans un tableau non vide. `noUncheckedIndexedAccess`
 * rend `tableau[i]` potentiellement `undefined` : l'appelant a déjà vérifié
 * la non-vacuité, cette garde ne fait que le prouver au compilateur sans
 * `!` de complaisance.
 */
function choisir<T>(tableau: readonly T[], alea: () => number): T {
  const valeur = tableau[Math.floor(alea() * tableau.length)];
  if (valeur === undefined)
    throw new Error('tableau vide passé à choisir — bug du test, pas du moteur');
  return valeur;
}

/**
 * Joue une partie complète au hasard depuis la position de départ, en
 * vérifiant les trois invariants à chaque coup. Rend `true` si la partie
 * s'est vraiment terminée, `false` si elle a buté sur le filet de
 * sécurité — utile à l'appelant pour s'assurer que ce n'est pas LA norme.
 */
function jouerPartieAleatoire(alea: () => number, numeroPartie: number): boolean {
  let etat = positionDepart();
  let coups = 0;
  // Filet de sécurité, pas une attente de fin de partie : la spec dit
  // explicitement qu'aucune règle de répétition n'est implémentée, et le
  // jeu au hasard (par opposition au jeu stratégique) peut légitimement
  // faire tourner quelques graines en boucle très longtemps sans jamais
  // affamer personne ni atteindre un seuil de victoire. Ce plafond borne
  // seulement le temps du test ; une partie qui l'atteint est abandonnée
  // sans verdict, pas signalée comme un échec. Mesuré sur cette graine :
  // moins de 1% des parties l'atteignent.
  const LIMITE_COUPS = 4000;

  while (issue(etat).fini === false && coups < LIMITE_COUPS) {
    const contexte = `partie ${numeroPartie}, coup ${coups}`;
    const legaux = coupsLegaux(etat);

    // Invariant 2 (légalité) : `issue` a dit que la partie continue, donc
    // un coup doit exister.
    assert(
      legaux.length > 0,
      `${contexte} : issue() dit la partie non finie mais coupsLegaux() est vide`,
    );

    for (const trou of legaux) {
      // Aucun coup ne part d'un trou vide ni d'un trou adverse.
      assert(grainesEn(etat.trous, trou) > 0, `${contexte} : le trou légal ${trou} est vide`);
      assert(
        campDuTrou(trou) === etat.trait,
        `${contexte} : le trou légal ${trou} n'appartient pas à ${etat.trait}`,
      );
    }

    // Invariant 3 (nourrissage) : quand l'adversaire est à zéro, tout coup
    // légal doit lui donner au moins une graine — sans quoi le coup
    // n'aurait pas dû être dans `legaux`.
    const adv = adversaire(etat.trait);
    if (sommeCote(etat.trous, adv) === 0) {
      for (const trou of legaux) {
        assert(
          nourrit(etat.trous, trou, adv),
          `${contexte} : le trou légal ${trou} ne nourrit pas ${adv}, pourtant affamé`,
        );
      }
    }

    const trou = choisir(legaux, alea);
    const suivant = appliquer(etat, trou);

    // Invariant 1 (conservation), après CE coup précisément — semis et
    // prise en cascade comprises.
    assert(
      sommeTotale(suivant) === 48,
      `${contexte} : ${sommeTotale(suivant)} graines après le coup ${trou}, pas 48`,
    );

    // Invariant 2 (suite) : aucun trou ne devient négatif.
    for (let t = 0; t < NB_TROUS; t += 1) {
      assert(
        grainesEn(suivant.trous, t) >= 0,
        `${contexte} : le trou ${t} est négatif après le coup ${trou}`,
      );
    }

    etat = suivant;
    coups += 1;
  }

  const finale = issue(etat);
  if (!finale.fini) return false; // partie abandonnée sur le filet de sécurité, pas un échec — voir le commentaire ci-dessus

  // Invariant 3 (suite) : si la partie s'est arrêtée sans qu'aucun grenier
  // n'ait atteint le seuil de victoire, c'est que la famine sans issue a
  // joué — `coupsLegaux` doit être vide sur l'état final, et la récolte
  // (vérifiée ici en la refaisant à la main) doit conserver les 48 graines.
  // Un seul appel par partie : `expect` reste à sa place ici.
  if (etat.greniers.sud < 25 && etat.greniers.nord < 25) {
    expect(coupsLegaux(etat)).toEqual([]);
    const sud = etat.greniers.sud + sommeCote(etat.trous, 'sud');
    const nord = etat.greniers.nord + sommeCote(etat.trous, 'nord');
    expect(sud + nord).toBe(48);
  }
  return true;
}

describe(`invariants sur ${NB_PARTIES} parties aléatoires (graine ${GRAINE})`, () => {
  it(
    'conserve toujours 48 graines, ne joue que des coups légaux, et respecte l’obligation de nourrir',
    { timeout: 30_000 },
    () => {
      const alea = creerAleatoire(GRAINE);
      let terminees = 0;
      for (let partie = 0; partie < NB_PARTIES; partie += 1) {
        if (jouerPartieAleatoire(alea, partie)) terminees += 1;
      }
      // Le filet de sécurité existe pour la rare partie qui boucle
      // indéfiniment au hasard (pas de règle de répétition, voir la spec) ;
      // s'il se déclenchait pour la plupart des parties, ce serait `issue`
      // qui ne détecterait plus jamais aucune fin — un vrai bug, pas de la
      // malchance statistique.
      expect(terminees).toBeGreaterThan(NB_PARTIES * 0.9);
    },
  );
});
