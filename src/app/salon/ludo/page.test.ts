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
 * dépôt pour ces trois fichiers, et dupliquer une fonction pure de vingt
 * lignes coûte moins qu'une dépendance croisée entre les tests de trois
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
    // La page ne réimplémente rien : elle appelle `lancerDe`, `passerLaMain`,
    // `coupsLegaux`, `appliquer` et `issue`. Une règle recopiée ici finirait
    // par diverger des invariants du moteur (voir la spec).
    expect(page).toContain('lancerDe');
    expect(page).toContain('passerLaMain');
    expect(page).toContain('coupsLegaux');
    expect(page).toContain('appliquer');
    expect(page).toContain('issue');
  });

  it('ne garde aucun état local qui doublerait le dé de l’état persisté', () => {
    // Le dé fait partie de l'état PERSISTÉ (`etat.de`, voir `lib/ludo/etat.ts`)
    // précisément pour qu'un rechargement entre le lancer et le coup ne
    // permette pas de relancer jusqu'au six. Un `useState` local portant le
    // dé romprait cette garantie en silence.
    expect(page).not.toMatch(/useState[^;]*\bde\b[^;]*setDe\b/);
    expect(page).not.toContain('const [de, setDe]');
  });

  it('la zone d’état est unique, avec `aria-live`', () => {
    // Exigence propre au Ludo : contrairement aux dames et à l'Awalé, qui
    // ont chacun une seconde zone `message` distincte, cet écran doit tout
    // dire dans UNE seule zone — sans quoi le tour qui passe faute de coup
    // pourrait s'annoncer ailleurs que là où le joueur regarde déjà.
    const occurrences = page.match(/aria-live="polite"/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it('annonce le tour qui passe faute de coup possible', () => {
    // Le défaut le plus probable de cet écran, dit la consigne : un tour qui
    // ne peut rien jouer doit se dire clairement, jamais se figer en
    // silence. `lancer` doit lui-même détecter l'absence de coup légal
    // (`coupsLegaux` vide après le lancer) et faire passer la main avant
    // même de sauvegarder — jamais persister un dé que personne ne peut
    // jouer.
    const l = corps(page, 'const lancer = useCallback(');
    expect(l).toMatch(/coupsLegaux\(suivant\)\.length === 0/);
    expect(l).toContain('passerLaMain(suivant)');
    expect(l).toMatch(/Aucun coup possible avec ce \$\{deJoue\}/);
  });

  it('annonce les trois six d’affilée qui annulent le tour', () => {
    const l = corps(page, 'const lancer = useCallback(');
    expect(l).toMatch(/suivant\.trait !== traitAvant/);
    expect(l).toMatch(/Trois six d’affilée/);
  });

  it('annonce le six qui fait rejouer le même camp', () => {
    const j = corps(page, 'const jouerPion = useCallback(');
    expect(j).toMatch(/de === 6 && suivant\.trait === camp/);
    expect(j).toMatch(/rejoue/);
  });

  it('n’active le pion joué que si `coupsLegaux` l’autorise', () => {
    // Défense en profondeur : même si le plateau ne rend déjà cliquables
    // que les pions jouables, `jouerPion` doit refuser lui-même un index
    // hors de cette liste plutôt que de faire confiance au seul rendu.
    const j = corps(page, 'const jouerPion = useCallback(');
    expect(j).toMatch(/if \(!jouables\.includes\(index\)\) return;/);
  });

  it('n’active le bouton « Lancer le dé » que si aucun dé n’attend d’être joué', () => {
    // Un bouton actif qui ne ferait rien : lancer alors qu'un dé est déjà en
    // attente lèverait dans le moteur (`lancerDe` refuse un second lancer).
    expect(page).toMatch(/onClick=\{lancer\}\s+disabled=\{termine \|\| etat\.de !== null\}/);
  });

  it('offre la nulle par accord', () => {
    // Remplace l'absence de règle de répétition : c'est ce qui permet de
    // sortir d'une partie interminable.
    expect(page).toContain('Match nul');
  });

  it('ramène au Salon', () => {
    expect(page).toContain('/salon');
  });

  it('ne bloque jamais le jeu sur un échec de sauvegarde', () => {
    expect(page).toMatch(/\.catch\(/);
  });

  it('sauvegarde le lancer avec un compteur strictement supérieur au précédent', () => {
    // Même défaut possible qu'aux dames et à l'Awalé : envoyer `compteur`
    // (celui d'AVANT le geste) au lieu de `prochain` rend 409 STALE_STATE en
    // silence, et le joueur retrouve le plateau au coup zéro en rouvrant
    // l'onglet. Le dé faisant partie de l'état persisté, CE geste-ci doit
    // suivre la même règle que jouer un pion.
    const l = corps(page, 'const lancer = useCallback(');
    expect(l).toMatch(/const prochain = compteur \+ 1;/);
    expect(l).toContain('setCompteur(prochain)');
    expect(l).toMatch(/sauvegarderEtat\(\s*partieId,\s*suivant,\s*prochain\s*\)/);
    expect(l).not.toMatch(/sauvegarderEtat\([^)]*,\s*compteur\s*\)/);
  });

  it('sauvegarde chaque pion joué avec un compteur strictement supérieur au précédent', () => {
    const j = corps(page, 'const jouerPion = useCallback(');
    expect(j).toMatch(/const prochain = compteur \+ 1;/);
    expect(j).toContain('setCompteur(prochain)');
    expect(j).toMatch(/sauvegarderEtat\(\s*partieId,\s*suivant,\s*prochain\s*\)/);
    expect(j).not.toMatch(/sauvegarderEtat\([^)]*,\s*compteur\s*\)/);
  });

  it('offre toujours de repartir sur une partie jouable quand la partie est finie', () => {
    // La propriété critique reprise des dames et de l'Awalé : depuis l'état
    // terminal, un bouton relance une partie jouable, plutôt que de laisser
    // une partie `IN_PROGRESS` sur une position terminale enfermer le
    // couple hors du jeu (l'index unique partiel interdit d'en créer une
    // seconde).
    const blocFin = bloc(page, 'termine && (');
    expect(blocFin).toContain('Nouvelle partie');
    expect(blocFin).toContain('onClick={nouvellePartie}');
  });

  it('ne laisse aucun marqueur de fin survivre à un chargement', () => {
    // `nulle` n'existe dans aucune position, et `message` commenterait un
    // geste (un lancer, un coup) qui n'a plus de plateau : les deux doivent
    // être remis à zéro par `charger()` lui-même, pas par ses appelants.
    const c = corps(page, 'const charger = useCallback(');
    expect(c).toContain('setNulle(false)');
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

  it('relie chaque prénom à sa progression', () => {
    const blocJeu = bloc(page, 'pretAJouer && (');
    expect(blocJeu).toMatch(/<JoueurEnTete[\s\S]*arrives=\{arrivees\.sud\}/);
    expect(blocJeu).toMatch(/<JoueurEnTete[\s\S]*arrives=\{arrivees\.nord\}/);
  });

  it('traduit l’échec de chargement depuis le code d’erreur, jamais depuis le texte brut', () => {
    expect(page).toContain('ApiError');
    expect(page).toMatch(/err\.code/);
    expect(page).not.toMatch(/setErreur\(\s*err\.message/);
  });
});

describe('la surface de jeu a déménagé sous le plateau', () => {
  // Correction du 2026-09-10 : une case du ruban de 52 cases fait environ
  // 28px sur un téléphone, bien sous le seuil tactile de 48px. Le plateau
  // ne reçoit donc plus les clics — `Plateau` n'a plus reçu `jouables` ni
  // `onPion` — et le choix du pion se fait dans une rangée de vrais
  // boutons sous le plateau.

  it('le plateau n’est plus cliquable : il n’a plus `jouables` ni `onPion`', () => {
    const debut = page.indexOf('<Plateau');
    const fin = page.indexOf('/>', debut);
    if (debut === -1 || fin === -1) throw new Error('balise <Plateau … /> introuvable');
    const balise = page.slice(debut, fin + 2);
    expect(balise).not.toMatch(/jouables=/);
    expect(balise).not.toMatch(/onPion=/);
    expect(balise).toMatch(/pionSurligne=/);
  });

  it('aucune cible d’action ne descend sous le seuil tactile de 48px', () => {
    // `min-h-12` en Tailwind vaut 3rem, soit 48px — le seuil que ce dépôt
    // s'impose. Une régression qui réduirait cette hauteur (par exemple en
    // copiant la taille des pions du plateau, 20px) rendrait le jeu
    // pénible sur l'appareil pour lequel il est fait : deux personnes qui
    // se passent un téléphone.
    const rangee = bloc(page, 'jouables.length > 0 && (');
    expect(rangee).toMatch(/min-h-12/);
  });

  it('un bouton d’action par pion jouable, jamais par case', () => {
    const rangee = bloc(page, 'jouables.length > 0 && (');
    expect(rangee).toMatch(/\{jouables\.map\(\(index\) => \(/);
    expect(rangee).toMatch(/onClick=\{\(\) => jouerPion\(index\)\}/);
    expect(rangee).toContain('descriptionCoup(etat, index)');
  });

  it('nomme chaque bouton dans les mots du jeu, pas ceux du code', () => {
    const d = corps(page, 'function descriptionCoup(etat: EtatLudo, index: number): string');
    expect(d).toContain('Sortir un pion de l’enclos');
    expect(d).toMatch(/Avancer le pion de la case \$\{caseDepart\} à la case/);
    expect(d).toContain('Rentrer à l’arrivée');
  });

  it('ne décrit un coup qu’en relisant la géométrie du moteur, jamais en la réinventant', () => {
    const d = corps(page, 'function descriptionCoup(etat: EtatLudo, index: number): string');
    expect(d).toContain('avancer(pion, de)');
    expect(d).toContain('caseAbsolue(');
  });

  it('met en évidence, sur le plateau, le pion que la rangée d’actions survole ou focalise', () => {
    expect(page).toMatch(/onMouseEnter=\{\(\) => setSurvol\(index\)\}/);
    expect(page).toMatch(/onFocus=\{\(\) => setSurvol\(index\)\}/);
    expect(page).toMatch(
      /pionSurligne=\{survol !== null \? \{ camp: etat\.trait, index: survol \} : null\}/,
    );
  });

  it('un survol ne survit pas au lancer ou au coup qui reconstruit la rangée', () => {
    const l = corps(page, 'const lancer = useCallback(');
    expect(l).toContain('setSurvol(null)');
    const j = corps(page, 'const jouerPion = useCallback(');
    expect(j).toContain('setSurvol(null)');
    const c = corps(page, 'const charger = useCallback(');
    expect(c).toContain('setSurvol(null)');
  });
});
