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
 * Copié de `salon/mot/page.test.ts` — pas d'utilitaire partagé dans ce
 * dépôt pour ces fichiers, et dupliquer une fonction pure de vingt lignes
 * coûte moins qu'une dépendance croisée entre les tests de deux jeux.
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
    // La page ne réimplémente rien : elle appelle `tenterMot`, `passerTour`,
    // `partieTerminee`, `issue`, `score`, `grilleAffichee` et
    // `definitionsAffichees`. Une règle recopiée ici finirait par diverger
    // des invariants du moteur (voir la spec).
    expect(page).toContain('tenterMot');
    expect(page).toContain('passerTour');
    expect(page).toContain('partieTerminee');
    expect(page).toContain('issue(');
    expect(page).toContain('score(');
    expect(page).toContain('grilleAffichee');
    expect(page).toContain('definitionsAffichees');
  });

  it('ramène au Salon', () => {
    expect(page).toContain('/salon');
  });

  it('ne bloque jamais le jeu sur un échec de sauvegarde', () => {
    expect(page).toMatch(/\.catch\(/);
  });

  it('sauvegarde chaque coup avec un compteur strictement supérieur au précédent', () => {
    // Même défaut possible qu'aux quatre autres jeux : envoyer `compteur`
    // (celui d'AVANT le coup) au lieu de `prochain` rend 409 STALE_STATE à
    // chaque sauvegarde, en silence, et le couple retrouve la partie au
    // coup zéro en rouvrant l'onglet.
    const a = corps(page, 'function appliquerEtSauver(suivant: EtatMotsCroises)');
    expect(a).toMatch(/const prochain = compteur \+ 1;/);
    expect(a).toContain('setCompteur(prochain)');
    expect(a).toMatch(/sauvegarderEtat\(\s*partieId,\s*suivant,\s*prochain\s*\)/);
    expect(a).not.toMatch(/sauvegarderEtat\([^)]*,\s*compteur\s*\)/);
  });

  it('traduit l’échec de chargement depuis le code d’erreur, jamais depuis le texte brut', () => {
    expect(page).toContain('ApiError');
    expect(page).toMatch(/err\.code/);
    expect(page).not.toMatch(/setErreur\(\s*err\.message/);
  });

  it('n’offre la partie que si elle a bien pu être chargée', () => {
    const blocEchec = bloc(page, 'erreur !== null && (');
    expect(blocEchec).not.toContain('<Grille');
    expect(blocEchec).not.toContain('LigneDefinition');
    expect(blocEchec).toContain('Réessayer');
    expect(blocEchec).toContain('/salon');
  });

  it('ne laisse aucun marqueur de la partie précédente survivre à un chargement', () => {
    const c = corps(page, 'const charger = useCallback((): (() => void) =>');
    expect(c).toContain('setSelection(null)');
    expect(c).toContain("setSaisie('')");
    expect(c).toContain('setDernierResultat(null)');
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

  it('offre toujours de repartir sur une partie jouable quand la partie est finie', () => {
    // La propriété critique reprise des quatre autres jeux : depuis l'état
    // terminal, un bouton relance une partie jouable plutôt que de laisser
    // une partie IN_PROGRESS sur une position terminale enfermer le couple
    // hors du jeu.
    const blocFin = bloc(page, '{fin.fini && (');
    expect(blocFin).toContain('Nouvelle partie');
    expect(blocFin).toContain('onClick={nouvellePartie}');
  });

  describe('l’alternance stricte : une bonne réponse ne rejoue jamais', () => {
    it('soumettreTentative ne redonne jamais le trait à celui qui vient de jouer', () => {
      // La page elle-même ne touche jamais à `etat.trait` : c'est
      // `tenterMot` qui décide, et cette fonction se contente d'appliquer
      // ce qu'il renvoie — aucune branche locale « si correct, rejouer ».
      const s = corps(page, 'function soumettreTentative()');
      expect(s).not.toMatch(/if\s*\(\s*resultat\.correct/);
      expect(s).toContain('appliquerEtSauver(resultat.etat)');
    });

    it('refuse aussi un emplacement déjà trouvé ou une partie déjà terminée — défense en profondeur', () => {
      const s = corps(page, 'function soumettreTentative()');
      expect(s).toMatch(/partieTerminee\(etat\)/);
      expect(s).toMatch(/estTrouve\(etat, selection\)/);
    });
  });

  describe('choisir une définition puis saisir un mot', () => {
    it('choisirDefinition refuse une définition déjà trouvée ou une partie finie', () => {
      const c = corps(page, 'function choisirDefinition(emplacement: Emplacement)');
      expect(c).toMatch(/partieTerminee\(etat\)/);
      expect(c).toMatch(/estTrouve\(etat, emplacement\)/);
    });

    it('le champ de saisie n’apparaît qu’une fois une définition choisie', () => {
      const b = bloc(page, '!fin.fini && selection !== null && (');
      expect(b).toContain('id="proposition"');
      expect(b).toContain('onClick={soumettreTentative}');
    });
  });

  describe('passer son tour', () => {
    it('appelle passerTour et sauvegarde comme un coup normal', () => {
      const p = corps(page, 'function passer()');
      expect(p).toContain('passerTour(etat)');
      expect(p).toContain('appliquerEtSauver(suivant)');
      expect(p).toMatch(/partieTerminee\(etat\)/);
    });
  });

  describe('accessibilité', () => {
    it('porte une seule zone d’état avec aria-live', () => {
      const occurrences = page.match(/aria-live="polite"/g) ?? [];
      expect(occurrences).toHaveLength(1);
    });

    it('donne au champ de saisie une cible tactile d’au moins 48px', () => {
      const occurrences = page.match(/min-h-\[48px\]/g) ?? [];
      expect(occurrences.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('aucun bouton actif qui ne ferait rien', () => {
    it('le bouton de validation est désactivé tant que la saisie est vide', () => {
      const b = bloc(page, '!fin.fini && selection !== null && (');
      expect(b).toMatch(/disabled=\{saisie\.trim\(\) === ''\}/);
    });

    it('une définition déjà trouvée n’est plus un bouton actionnable', () => {
      expect(page).toMatch(/disabled=\{!jouable\}/);
      expect(page).toMatch(/jouable=\{!fin\.fini && !d\.trouve\}/);
    });
  });
});
