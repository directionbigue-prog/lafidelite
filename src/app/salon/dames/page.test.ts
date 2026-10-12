// Assertions au niveau de la source : le dépôt ne monte pas de composants.
// Ce qui est vérifié ici, ce sont les invariants qui se cassent en silence.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const page = readFileSync(path.join(ICI, 'page.tsx'), 'utf8');

/**
 * Extrait le bloc JSX qui suit un marqueur du type `nomDeGarde && (` ou
 * `condition ? (`, en comptant les parenthèses jusqu'à celle qui referme
 * la première ouverte — pas jusqu'à la prochaine `)` littérale, qui
 * appartiendrait à une expression imbriquée (un appel de fonction, un
 * `Math.max(...)`, etc.).
 *
 * Ce comptage tient tant que le reste du fichier a des parenthèses
 * équilibrées — vrai de tout fichier TypeScript qui compile — donc le test
 * survit à une reformulation de l'indentation par Prettier, contrairement
 * à une regex ancrée sur des espaces précis.
 */
function bloc(source: string, marqueur: string): string {
  const debut = source.indexOf(marqueur);
  if (debut === -1) throw new Error(`marqueur introuvable dans page.tsx : ${marqueur}`);
  let i = debut + marqueur.length;
  let profondeur = 1;
  for (; i < source.length; i += 1) {
    if (source[i] === '(') profondeur += 1;
    else if (source[i] === ')') {
      profondeur -= 1;
      if (profondeur === 0) break;
    }
  }
  return source.slice(debut, i + 1);
}

/**
 * Le corps `{ … }` de la déclaration qui suit un marqueur — même comptage,
 * en accolades, pour ce qui n'est pas du JSX entre parenthèses.
 *
 * C'est l'outil qui manquait aux assertions de ce fichier : chercher un mot
 * dans `page.tsx` entier revient à interroger les imports et les
 * commentaires, pas la fonction dont le test porte le nom.
 */
function corps(source: string, marqueur: string): string {
  const debut = source.indexOf(marqueur);
  if (debut === -1) throw new Error(`marqueur introuvable dans page.tsx : ${marqueur}`);
  const ouvrante = source.indexOf('{', debut + marqueur.length);
  if (ouvrante === -1) throw new Error(`corps introuvable pour : ${marqueur}`);
  let profondeur = 1;
  let i = ouvrante + 1;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') profondeur += 1;
    else if (source[i] === '}') {
      profondeur -= 1;
      if (profondeur === 0) break;
    }
  }
  return source.slice(ouvrante, i + 1);
}

describe('l’écran de jeu', () => {
  it('exige un compte connecté', () => {
    expect(page).toMatch(/useUser\s*\(/);
    expect(page).toContain('if (!user) return null;');
  });

  it('délègue toutes les règles au moteur', () => {
    // La page ne réimplémente rien : elle appelle `toucher` et
    // `appliquer`. Une règle recopiée ici finirait par diverger des 60
    // tests du moteur.
    expect(page).toContain('toucher');
    expect(page).toContain('appliquer');
  });

  it('fait valider le coup avant de l’appliquer', () => {
    // Le canevas montre « Valider le coup » et « Annuler ». Avec la prise
    // obligatoire et les rafles, voir la séquence avant de s'engager est
    // la moitié de l'ergonomie.
    expect(page).toContain('Valider le coup');
    expect(page).toContain('Annuler');
  });

  it('annonce la prise obligatoire', () => {
    expect(page).toMatch(/prise est obligatoire/i);
  });

  it('offre la nulle par accord', () => {
    // Elle remplace la règle des 25 coups, non implémentée : c'est ce qui
    // permet de sortir d'une finale interminable. La spec la promet.
    expect(page).toContain('Match nul');
  });

  it('ramène au Salon', () => {
    expect(page).toContain('/salon');
  });

  it('ne bloque jamais le jeu sur un échec de sauvegarde', () => {
    // La sauvegarde est un confort (la reprise), pas une condition du
    // coup. Elle part sans être attendue et son échec est absorbé.
    expect(page).toMatch(/\.catch\(/);
  });

  it('sauvegarde chaque coup avec un compteur strictement supérieur au précédent', () => {
    // C'est ce compteur qui rend la garde monotone du serveur efficace :
    // `PUT /state` écrit sous `moveCount: { lt: <reçu> }`. Envoyer le
    // compteur d'AVANT le coup — l'erreur d'un caractère, `compteur` au
    // lieu de `prochain` — rend 409 STALE_STATE à CHAQUE sauvegarde ;
    // l'échec est avalé, le joueur ne voit rien, et il retrouve le plateau
    // au coup zéro en rouvrant l'onglet.
    //
    // L'ancienne assertion (`toMatch(/moveCount|compteur/)` sur le fichier
    // entier) était satisfaite par le seul import de type : elle laissait
    // passer exactement cette mutation.
    const v = corps(page, 'function valider()');
    expect(v).toMatch(/const prochain = compteur \+ 1;/);
    expect(v).toContain('setCompteur(prochain)');
    expect(v).toMatch(/sauvegarderEtat\(\s*partieId,\s*suivant,\s*prochain\s*\)/);
    expect(v).not.toMatch(/sauvegarderEtat\([^)]*,\s*compteur\s*\)/);
  });

  it('offre toujours de repartir sur une partie jouable quand la partie est finie', () => {
    // LE défaut critique de la branche. `valider()` lance la clôture en
    // tâche de fond et en avale l'échec ; si elle est perdue (onglet fermé
    // sur le coup gagnant, 500, coupure), la base garde une partie
    // `IN_PROGRESS` sur une position TERMINALE. À la reprise, le moteur la
    // dit finie — plus aucun coup jouable — et l'index unique partiel
    // `BoardGame_couple_kind_in_progress_unique` interdit d'en créer une
    // seconde. L'écran de fin n'offrait que « Retour au Salon » : le
    // couple ne pouvait plus jamais jouer aux dames.
    //
    // La propriété gardée ici : depuis l'état terminal, un bouton relance
    // une partie jouable.
    const blocFin = bloc(page, 'termine ? (');
    expect(blocFin).toContain('Nouvelle partie');
    expect(blocFin).toContain('onClick={nouvellePartie}');
  });

  it('ne laisse aucun marqueur de fin survivre à un chargement', () => {
    // Même défaut que C-1 sous une autre forme : un écran qui affirme une
    // chose fausse de l'état réel. `nulle` n'existe dans aucune position —
    // c'est un état purement local. Laissé à `true`, il faisait annoncer
    // « Match nul, d'un commun accord » sur une partie rechargée TOUJOURS
    // JOUABLE, avec les seuls boutons de fin : « Match nul » → /end échoue
    // (la nulle est actée localement, la partie reste IN_PROGRESS sur une
    // position non terminale) → « Nouvelle partie » → /end échoue →
    // « Réessayer » → `charger()`. Plus moyen de reprendre la partie sans
    // recharger la page à la main.
    //
    // `enAttente` est pire encore : c'est un coup calculé sur le plateau
    // précédent, que « Valider le coup » appliquerait au nouveau.
    //
    // Les quatre remises à zéro appartiennent à `charger()` lui-même, pas
    // à ses appelants : « Réessayer » passe par lui sans rien réinitialiser
    // de son côté.
    const c = corps(page, 'const charger = useCallback(');
    expect(c).toContain('setNulle(false)');
    expect(c).toContain('setEnAttente(null)');
    expect(c).toContain('setInteraction(INTERACTION_VIDE)');
    expect(c).toContain('setMessage(null)');
  });

  it('clôt réellement la partie avant d’en ouvrir une neuve', () => {
    // « Aucun bouton qui prétende agir sans agir » : la requête est
    // ATTENDUE (sans quoi la nouvelle partie se heurterait à l'index
    // unique), et son échec est montré au lieu d'être avalé — sinon le
    // bouton de sortie souffrirait du défaut dont il est le remède.
    const n = corps(page, 'async function nouvellePartie()');
    expect(n).toMatch(/await terminerPartie\(\s*partieId,\s*'COMPLETED'\s*\)/);
    expect(n).toContain('setErreur(');
    expect(n).toContain('charger()');
    expect(n).not.toMatch(/\.catch\(\(\) => undefined\)/);
  });

  it('n’annonce pas un abandon qui n’a pas eu lieu', () => {
    // Partir vers le Salon sur un échec de `/end` ferait croire la partie
    // abandonnée ; le joueur la retrouverait intacte au retour.
    const a = corps(page, 'async function abandonner()');
    expect(a).toMatch(/await terminerPartie\(\s*partieId,\s*'ABANDONED'\s*\)/);
    expect(a).toContain('setErreur(');
    // Le retour au Salon ne doit pas être atteignable après l'échec.
    const echec = a.indexOf('setErreur(');
    const retour = a.indexOf("router.push('/salon')");
    expect(echec).toBeGreaterThan(-1);
    expect(retour).toBeGreaterThan(echec);
    expect(a.slice(echec, retour)).toContain('return;');
  });

  it('n’offre un plateau jouable que si la partie a bien pu être chargée', () => {
    // Ronde de correction 1 : sans cette garde, un damier cliquable et un
    // bouton « Valider le coup » actif survivaient à un échec de
    // `commencerPartie`, alors que `valider()` n'avait nulle part où
    // sauvegarder le coup — le clic était avalé en silence. Le damier et
    // la validation ne doivent donc exister QUE dans la branche où le
    // chargement a réussi ; le bloc d'échec ne doit contenir ni l'un ni
    // l'autre.
    const blocJeu = bloc(page, 'pretAJouer && (');
    expect(blocJeu).toContain('<Damier');
    expect(blocJeu).toContain('Valider le coup');

    const blocEchec = bloc(page, 'erreur !== null && (');
    expect(blocEchec).not.toContain('<Damier');
    expect(blocEchec).not.toContain('Valider le coup');
  });

  it('donne une issue à l’échec de chargement : réessayer, ou repartir vers le Salon', () => {
    // Un écran d'échec sans bouton oblige à recharger la page à l'aveugle.
    const blocEchec = bloc(page, 'erreur !== null && (');
    expect(blocEchec).toContain('Réessayer');
    expect(blocEchec).toContain('/salon');
  });

  it('relie chaque prénom à la couleur de ses pièces', () => {
    // Le jeu se joue à deux sur un seul appareil : au moment où l'écran
    // change de mains, « c'est mon tour » ne suffit pas — il faut savoir
    // QUELLES pièces sont les siennes. L'en-tête disait « À Awa de jouer »
    // et posait « 20 — 20 » à l'autre bout de la ligne, sans jamais relier
    // un prénom à une couleur ni un nombre à un camp.
    const blocJeu = bloc(page, 'pretAJouer && (');
    expect(blocJeu).toMatch(/<CampEnTete[\s\S]*disque=\{DISQUE\.blanc\}/);
    expect(blocJeu).toMatch(/<CampEnTete[\s\S]*disque=\{DISQUE\.noir\}/);
    // La pastille reprend les couleurs de la pièce, pas une teinte inventée.
    const d = corps(page, 'const DISQUE: Record<Camp, string>');
    expect(d).toContain('bg-cream');
    expect(d).toContain('bg-wine');
  });

  it('annonce la portée du coup avant de le faire jouer', () => {
    // Une rafle se désigne en plusieurs clics et peut emporter plusieurs
    // pièces ; « Valider le coup » s'allumait sans rien dire de ce qu'il
    // allait appliquer.
    const blocJeu = bloc(page, 'pretAJouer && (');
    expect(blocJeu).toContain('enAttente.captures.length');
    expect(blocJeu).toMatch(/Coup prêt/);
  });

  it('n’offre pas d’annuler quand il n’y a rien à annuler', () => {
    // Même famille que le bouton muet corrigé plus haut : un contrôle actif
    // qui ne changerait rien à l'écran.
    const blocJeu = bloc(page, 'pretAJouer && (');
    expect(blocJeu).toMatch(/disabled=\{enAttente === null && interaction\.selection === null\}/);
  });

  it('traduit l’échec de chargement depuis le code d’erreur, jamais depuis le texte brut', () => {
    // « Branche sur `.code`, jamais sur le message » — CLAUDE.md. Le
    // wrapper `lib/api.ts` place le CODE stable dans `ApiError.message`
    // (il lit `body.error`, pas `body.message`), donc afficher
    // `err.message` montrerait un identifiant technique brut au joueur.
    expect(page).toContain('ApiError');
    expect(page).toMatch(/err\.code/);
    expect(page).not.toMatch(/setErreur\(\s*err\.message/);
  });
});
