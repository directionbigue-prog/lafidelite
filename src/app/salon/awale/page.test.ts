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
 * appartiendrait à une expression imbriquée.
 *
 * Copié de `salon/dames/page.test.ts` — pas d'utilitaire partagé dans ce
 * dépôt pour ces deux fichiers, et dupliquer une fonction pure de vingt
 * lignes coûte moins qu'une dépendance croisée entre les tests de deux
 * jeux.
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

/** Le corps `{ … }` de la déclaration qui suit un marqueur — même comptage, en accolades. */
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
    // La page ne réimplémente rien : elle appelle `coupsLegaux`, `appliquer`
    // et `issue`. Une règle recopiée ici finirait par diverger des
    // invariants du moteur (voir la spec).
    expect(page).toContain('coupsLegaux');
    expect(page).toContain('appliquer');
    expect(page).toContain('issue');
  });

  it('joue un coup en un seul clic, sans étape de validation séparée', () => {
    // Décision documentée dans l'en-tête du fichier : à l'Awalé un coup est
    // un seul clic sur un trou déjà filtré par `coupsLegaux` — rien ne
    // s'accumule avant de jouer, donc rien à valider ni à annuler. Un
    // « enAttente » (le nom qu'utilisent les dames pour le coup en attente
    // de validation) trahirait une étape de composition qui n'existe pas
    // ici.
    expect(page).not.toContain('enAttente');
    expect(page).not.toContain('Valider le coup');
    expect(page).not.toContain('>Annuler<');
    const o = corps(page, 'const onTrou = useCallback(');
    expect(o).toMatch(/const suivant = appliquer\(etat, trou\);/);
  });

  it('annonce l’obligation de nourrir un adversaire affamé', () => {
    expect(page).toMatch(/doit nourrir/);
  });

  it('offre la nulle par accord', () => {
    // Remplace la règle de répétition, non implémentée (voir la spec) :
    // c'est ce qui permet de sortir d'une partie interminable.
    expect(page).toContain('Match nul');
  });

  it('ramène au Salon', () => {
    expect(page).toContain('/salon');
  });

  it('ne bloque jamais le jeu sur un échec de sauvegarde', () => {
    expect(page).toMatch(/\.catch\(/);
  });

  it('sauvegarde chaque coup avec un compteur strictement supérieur au précédent', () => {
    // Même défaut possible qu'aux dames : envoyer `compteur` (celui d'AVANT
    // le coup) au lieu de `prochain` rend 409 STALE_STATE à chaque
    // sauvegarde, en silence, et le joueur retrouve le plateau au coup zéro
    // en rouvrant l'onglet.
    const o = corps(page, 'const onTrou = useCallback(');
    expect(o).toMatch(/const prochain = compteur \+ 1;/);
    expect(o).toContain('setCompteur(prochain)');
    expect(o).toMatch(/sauvegarderEtat\(\s*partieId,\s*suivant,\s*prochain\s*\)/);
    expect(o).not.toMatch(/sauvegarderEtat\([^)]*,\s*compteur\s*\)/);
  });

  it('offre toujours de repartir sur une partie jouable quand la partie est finie', () => {
    // La propriété critique reprise des dames : depuis l'état terminal, un
    // bouton relance une partie jouable, plutôt que de laisser une partie
    // `IN_PROGRESS` sur une position terminale enfermer le couple hors du
    // jeu (l'index unique partiel interdit d'en créer une seconde).
    const blocFin = bloc(page, 'termine && (');
    expect(blocFin).toContain('Nouvelle partie');
    expect(blocFin).toContain('onClick={nouvellePartie}');
  });

  it('ne laisse aucun marqueur de fin survivre à un chargement', () => {
    // `nulle` n'existe dans aucune position, et `dernierCoup` désignerait
    // un trou du plateau précédent : les deux doivent être remis à zéro par
    // `charger()` lui-même, pas par ses appelants.
    const c = corps(page, 'const charger = useCallback(');
    expect(c).toContain('setNulle(false)');
    expect(c).toContain('setDernierCoup(null)');
    expect(c).toContain('setMessage(null)');
  });

  it('clôt réellement la partie avant d’en ouvrir une neuve', () => {
    const n = corps(page, 'async function nouvellePartie()');
    expect(n).toMatch(/await terminerPartie\(\s*partieId,\s*'COMPLETED'\s*\)/);
    expect(n).toContain('setErreur(');
    expect(n).toContain('charger()');
    expect(n).not.toMatch(/\.catch\(\(\) => undefined\)/);
  });

  it('n’annonce pas un abandon qui n’a pas eu lieu', () => {
    const a = corps(page, 'async function abandonner()');
    expect(a).toMatch(/await terminerPartie\(\s*partieId,\s*'ABANDONED'\s*\)/);
    expect(a).toContain('setErreur(');
    const echec = a.indexOf('setErreur(');
    const retour = a.indexOf("router.push('/salon')");
    expect(echec).toBeGreaterThan(-1);
    expect(retour).toBeGreaterThan(echec);
    expect(a.slice(echec, retour)).toContain('return;');
  });

  it('n’offre un plateau jouable que si la partie a bien pu être chargée', () => {
    const blocJeu = bloc(page, 'pretAJouer && (');
    expect(blocJeu).toContain('<Plateau');

    const blocEchec = bloc(page, 'erreur !== null && (');
    expect(blocEchec).not.toContain('<Plateau');
  });

  it('donne une issue à l’échec de chargement : réessayer, ou repartir vers le Salon', () => {
    const blocEchec = bloc(page, 'erreur !== null && (');
    expect(blocEchec).toContain('Réessayer');
    expect(blocEchec).toContain('/salon');
  });

  it('relie chaque prénom à son grenier', () => {
    const blocJeu = bloc(page, 'pretAJouer && (');
    expect(blocJeu).toMatch(/<JoueurEnTete[\s\S]*graines=\{etat\.greniers\.sud\}/);
    expect(blocJeu).toMatch(/<JoueurEnTete[\s\S]*graines=\{etat\.greniers\.nord\}/);
  });

  it('n’active un trou que si `coupsLegaux` l’autorise', () => {
    // Défense en profondeur : même si le plateau ne rend déjà cliquables
    // que les trous jouables, `onTrou` doit refuser lui-même un trou hors
    // de cette liste plutôt que de faire confiance au seul rendu.
    const o = corps(page, 'const onTrou = useCallback(');
    expect(o).toMatch(/if \(!jouables\.includes\(trou\)\) return;/);
  });

  it('traduit l’échec de chargement depuis le code d’erreur, jamais depuis le texte brut', () => {
    expect(page).toContain('ApiError');
    expect(page).toMatch(/err\.code/);
    expect(page).not.toMatch(/setErreur\(\s*err\.message/);
  });
});
