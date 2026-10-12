// Le dictionnaire des mots de cinq lettres, chargé une fois.
//
// 6 806 entrées (voir `LICENCE-DICTIONNAIRE.md`, à côté du fichier JSON) :
// assez pour qu'un parcours linéaire à chaque tentative coûte cher au fil
// d'une partie qui peut en enchaîner jusqu'à douze (deux manches de six
// essais chacune). Un `Set` ramène chaque vérification à une recherche en
// temps constant, et le fichier n'est lu et transformé qu'une seule fois,
// au chargement du module — jamais à chaque tentative.
//
// Le fichier lui-même n'est ni régénéré ni téléchargé ici : voir la spec,
// « Le dictionnaire embarqué ».
import motsCinqLettres from './mots-cinq-lettres.json';
import { LONGUEUR_MOT } from './etat';

const DICTIONNAIRE: ReadonlySet<string> = new Set(motsCinqLettres as readonly string[]);

/**
 * Met une saisie sous la forme que le moteur compare et stocke : espaces
 * superflus retirés, tout en minuscules. Le dictionnaire lui-même ne
 * contient que des minuscules (vérifié à la préparation du fichier) —
 * comparer sans normaliser d'abord refuserait « ARBRE » à un joueur qui
 * l'a pourtant écrit correctement.
 */
export function normaliserMot(saisie: string): string {
  return saisie.trim().toLowerCase();
}

/**
 * Vrai si `mot` (déjà normalisé — voir `normaliserMot`) figure dans le
 * dictionnaire. La longueur n'a pas besoin d'être vérifiée séparément :
 * toutes les entrées du dictionnaire comptent `LONGUEUR_MOT` lettres, donc
 * un mot d'une autre longueur ne peut simplement pas y figurer.
 */
export function estUnMotDuDictionnaire(mot: string): boolean {
  return DICTIONNAIRE.has(mot);
}

/** Pourquoi une saisie a été refusée — pour un message utile, pas générique. */
export type RaisonRefus = 'longueur' | 'dictionnaire';

export type ResultatSaisie =
  | { readonly ok: true; readonly mot: string }
  | { readonly ok: false; readonly raison: RaisonRefus };

/**
 * Valide une saisie de joueur — mot proposé ou tentative — contre la forme
 * attendue puis contre le dictionnaire, et rend le mot normalisé en cas de
 * succès. Une seule fonction pour les deux usages : la spec impose
 * exactement la même règle à un mot choisi et à une tentative (« un mot du
 * dictionnaire »), donc les dupliquer serait le genre de copie qui finit
 * par diverger.
 */
export function validerSaisie(saisie: string): ResultatSaisie {
  const mot = normaliserMot(saisie);
  if ([...mot].length !== LONGUEUR_MOT) {
    return { ok: false, raison: 'longueur' };
  }
  if (!estUnMotDuDictionnaire(mot)) {
    return { ok: false, raison: 'dictionnaire' };
  }
  return { ok: true, mot };
}
