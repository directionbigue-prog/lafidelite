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
 * Copié de `salon/awale/page.test.ts` — pas d'utilitaire partagé dans ce
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
    // La page ne réimplémente rien : elle appelle `validerSaisie`,
    // `choisirMot`, `tenterMot`, `passerManche`, `mancheTerminee`,
    // `tentativesPourTrouver`, `issue`, `marquerTentative` et `phaseEcran`.
    // Une règle recopiée ici finirait par diverger des invariants du
    // moteur (voir la spec).
    expect(page).toContain('validerSaisie');
    expect(page).toContain('choisirMot');
    expect(page).toContain('tenterMot');
    expect(page).toContain('passerManche');
    expect(page).toContain('mancheTerminee');
    expect(page).toContain('tentativesPourTrouver');
    expect(page).toContain('issue(');
    expect(page).toContain('marquerTentative');
    expect(page).toContain('phaseEcran');
  });

  it('ramène au Salon', () => {
    expect(page).toContain('/salon');
  });

  it('ne bloque jamais le jeu sur un échec de sauvegarde', () => {
    expect(page).toMatch(/\.catch\(/);
  });

  it('sauvegarde chaque coup avec un compteur strictement supérieur au précédent', () => {
    // Même défaut possible qu'aux trois autres jeux : envoyer `compteur`
    // (celui d'AVANT le coup) au lieu de `prochain` rend 409 STALE_STATE à
    // chaque sauvegarde, en silence, et le joueur retrouve la partie au
    // coup zéro en rouvrant l'onglet.
    const a = corps(page, 'function appliquerEtSauver(suivant: EtatMot)');
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
    expect(blocEchec).not.toContain('<GrilleTentatives');
    expect(blocEchec).not.toContain('mot-choisi');
    expect(blocEchec).toContain('Réessayer');
    expect(blocEchec).toContain('/salon');
  });

  it('ne laisse aucun marqueur de la partie précédente survivre à un chargement', () => {
    const c = corps(page, 'const charger = useCallback((): (() => void) =>');
    expect(c).toContain("setSaisie('')");
    expect(c).toContain('setErreurSaisie(null)');
    expect(c).toContain('setAppareilConfirme(appareilConfirmeInitial(etatCharge))');
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
    // La propriété critique reprise des trois autres jeux : depuis l'état
    // terminal, un bouton relance une partie jouable plutôt que de laisser
    // une partie IN_PROGRESS sur une position terminale enfermer le couple
    // hors du jeu.
    const blocFin = bloc(page, "phase.kind === 'fin-partie' && (");
    expect(blocFin).toContain('Nouvelle partie');
    expect(blocFin).toContain('onClick={nouvellePartie}');
  });

  describe('une tentative refusée ne consomme aucun essai', () => {
    it('valide la saisie AVANT d’appeler le moteur, et s’arrête sur un refus', () => {
      const t = corps(page, 'function soumettreTentative()');
      const posValider = t.indexOf('validerSaisie(saisie)');
      const posRefus = t.indexOf('if (!resultat.ok)');
      const posTenter = t.indexOf('tenterMot(etat, resultat.mot)');
      expect(posValider).toBeGreaterThan(-1);
      expect(posRefus).toBeGreaterThan(posValider);
      expect(posTenter).toBeGreaterThan(posRefus);
      // Le chemin de refus s'arrête avant tout appel au moteur.
      const brancheRefus = t.slice(posRefus, posTenter);
      expect(brancheRefus).toContain('return;');
      expect(brancheRefus).not.toContain('tenterMot(');
    });

    it('refuse aussi une manche sans mot choisi ou déjà terminée — défense en profondeur', () => {
      const t = corps(page, 'function soumettreTentative()');
      expect(t).toMatch(/manche\.mot === null/);
      expect(t).toMatch(/mancheTerminee\(manche\)/);
    });

    it('donne au joueur un message qui dit que rien n’a été compté', () => {
      expect(page).toMatch(/n’a pas été comptée/);
    });
  });

  describe('le passage d’appareil masque le mot avant que le devineur ne commence', () => {
    it('l’écran d’attente ne rend jamais le mot secret', () => {
      const b = bloc(page, "phase.kind === 'attente-passage' && (");
      expect(b).not.toMatch(/\{phase\.manche\.mot\}/);
      expect(b).not.toMatch(/manche\.mot\}/);
      expect(b).toContain('Passe l’appareil');
    });

    it('l’écran de choix ne montre le mot qu’à celui qui le tape', () => {
      // C'est la personne qui SAISIT le mot qui le voit dans son propre
      // champ — c'est attendu. Ce test vérifie seulement qu'aucun texte
      // affiché à CÔTÉ du champ ne révèle le mot déjà choisi d'une manche
      // précédente (le cas de la manche 2, où la manche 1 a bien un mot).
      const b = bloc(page, "phase.kind === 'choix-mot' && (");
      expect(b).not.toMatch(/\{phase\.manche\.mot\}/);
    });

    it('la confirmation de passage ne dépend d’aucun aller-retour réseau', () => {
      const c = corps(page, 'function confirmerAppareilRecu()');
      expect(c).not.toContain('sauvegarderEtat');
      expect(c).not.toContain('api<');
      expect(c).toContain('setAppareilConfirme(true)');
    });
  });

  describe('accessibilité', () => {
    it('porte une seule zone d’état avec aria-live', () => {
      const occurrences = page.match(/aria-live="polite"/g) ?? [];
      expect(occurrences).toHaveLength(1);
    });

    it('ne marque jamais une lettre par la seule couleur : signe et nom accessible', () => {
      expect(page).toContain('aria-label={`${lettre}, ${NOM_STATUT[statut]}`}');
      expect(page).toMatch(/SIGNE:\s*Record<StatutLettre, string>/);
    });

    it('donne aux champs de saisie une cible tactile d’au moins 48px', () => {
      const occurrences = page.match(/min-h-\[48px\]/g) ?? [];
      expect(occurrences.length).toBeGreaterThanOrEqual(2); // choix-mot + deviner
    });
  });
});
