// Assertions au niveau de la source : le dépôt n'embarque ni jsdom ni
// Testing Library (voir la décision de test de `lib/game/`), donc on lit
// le fichier plutôt que de monter le composant.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(ICI, '..');
const menu = readFileSync(path.join(ICI, 'page.tsx'), 'utf8');
const shell = readFileSync(path.join(ICI, '..', '..', 'components', 'app', 'AppShell.tsx'), 'utf8');

/**
 * L'entrée `{ … }` de la table `JEUX` qui porte ce nom de jeu, extraite par
 * comptage d'accolades.
 *
 * La version précédente cherchait le `href` sur la même LIGNE que le nom,
 * ce qui supposait que l'entrée tienne sur une ligne. Ajouter un champ a
 * suffi : Prettier a réparti l'objet sur cinq lignes et le test est passé
 * au rouge alors que le code était juste. Une assertion qui dépend de la
 * mise en forme se casse au premier formatage — ce que celle-ci veut dire,
 * c'est « cette entrée-là porte ce href-là », indépendamment des retours à
 * la ligne.
 */
function entree(source: string, nom: string): string {
  const marqueur = `nom: '${nom}'`;
  const position = source.indexOf(marqueur);
  if (position === -1) throw new Error(`entrée introuvable dans JEUX : ${nom}`);
  const ouvrante = source.lastIndexOf('{', position);
  if (ouvrante === -1) throw new Error(`accolade ouvrante introuvable pour : ${nom}`);
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

describe('Le Salon', () => {
  it('mène au jeu de dames', () => {
    // La table `JEUX` porte la vérité sur les destinations : le jeu de
    // dames y a un href réel.
    expect(entree(menu, 'Jeu de dames')).toContain("href: '/salon/dames'");

    // La carte doit lier vers le href de SA PROPRE entrée (`jeu.href`), pas
    // vers une chaîne codée en dur. Sans cette assertion, un futur jeu
    // recevant un href réel hériterait silencieusement du lien des dames —
    // un mauvais lien qu'aucun test n'attraperait.
    expect(menu).toContain('href={jeu.href}');
    expect(menu).not.toMatch(/href="\/salon\/[a-z-]+"/);
  });

  it('mène à l’Awalé', () => {
    // Même vérité que pour les dames : la table `JEUX` porte la
    // destination réelle, et la carte doit lier vers `jeu.href`, jamais
    // vers un href codé en dur (déjà couvert par l'assertion ci-dessus).
    expect(entree(menu, 'Awalé')).toContain("href: '/salon/awale'");
  });

  it('mène au Ludo', () => {
    // Même vérité que pour les dames et l'Awalé.
    expect(entree(menu, 'Ludo')).toContain("href: '/salon/ludo'");
  });

  it('mène au Mot', () => {
    // Même vérité que pour les trois autres jeux jouables.
    expect(entree(menu, 'Le Mot')).toContain("href: '/salon/mot'");
  });

  it('mène aux mots croisés', () => {
    // Cinquième et dernier jeu du canevas : il a maintenant une vraie page,
    // même vérité que pour les quatre autres jeux jouables.
    expect(entree(menu, 'Mots croisés')).toContain("href: '/salon/mots-croises'");
  });

  it('reprend la phrase du canevas sur l’étanchéité au Score de Fidélité', () => {
    // C'est la promesse produit que la spec formalise : une partie du
    // Salon ne touche jamais au score du couple. La copie et le code
    // doivent dire la même chose.
    expect(menu).toContain('ne comptent pas dans votre Score de Fidélité');
  });

  it('signale une partie à reprendre sans en créer une', () => {
    // Un couple n'a qu'une partie en cours par jeu. Sans ce signal, rien ne
    // distingue « lancer une partie » de « retrouver celle d'hier soir ».
    //
    // La distinction qui compte est dans l'appel : `partieEnCours` lit
    // `GET /api/salon/current`, qui ne crée rien. `commencerPartie` — la
    // route idempotente qu'utilise l'écran de jeu — CRÉE la partie quand il
    // n'y en a pas : l'employer ici ferait ouvrir une partie à chaque
    // visite du menu, et l'index unique interdirait ensuite d'en ouvrir une
    // autre. Un menu ne doit rien produire.
    expect(menu).toContain('partieEnCours');
    expect(menu).not.toContain('commencerPartie');
    expect(menu).toContain('Reprendre');
  });

  it('n’affiche aucun prix en points', () => {
    // L'économie de points n'existe pas encore. Afficher « 10 pts »
    // annoncerait un débit que rien n'effectue.
    expect(menu).not.toMatch(/\d+\s*pts/);
  });
});

describe('les jeux liés existent réellement sur le disque', () => {
  // `navigation-reachable.test.ts` scanne des `href="..."` littéraux et des
  // `router.push/replace('...')` — il ne voit pas un attribut piloté par une
  // donnée comme `href={jeu.href}` (AppShell.tsx a déjà le même angle mort
  // pour sa propre table `NAV`, avec `href={item.href}`). Passer par la
  // donnée est le bon choix — pas de href codé en dur à dupliquer par jeu —
  // mais ça retire ce fichier de la couverture de ce tripwire-là. Cette
  // assertion referme le trou pour la table `JEUX` elle-même : tout href
  // non nul doit résoudre vers une vraie `page.tsx`, vérifié directement
  // sur le disque plutôt que par une regex qui ne peut pas voir la donnée.
  it('chaque href non nul de la table JEUX pointe vers une page.tsx existante', () => {
    const hrefs = [...menu.matchAll(/href:\s*'(\/salon\/[a-z0-9-]+)'/g)]
      .map((m) => m[1])
      .filter((href): href is string => href !== undefined);
    expect(hrefs).toContain('/salon/dames');
    expect(hrefs).toContain('/salon/awale');
    expect(hrefs).toContain('/salon/ludo');
    expect(hrefs).toContain('/salon/mot');
    expect(hrefs).toContain('/salon/mots-croises');
    for (const href of hrefs) {
      const pagePath = path.join(APP_DIR, ...href.split('/').filter(Boolean), 'page.tsx');
      expect(existsSync(pagePath)).toBe(true);
    }
  });
});

describe('la barre latérale', () => {
  it('propose la rubrique Le Salon', () => {
    expect(shell).toContain("href: '/salon'");
    expect(shell).toContain('Le Salon');
  });

  it('déclare la section correspondante', () => {
    expect(shell).toMatch(/AppSection\s*=[^;]*'salon'/);
  });
});
