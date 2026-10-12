// Prépare la liste des mots de cinq lettres embarquée par le jeu « Le Mot ».
//
// Lancé à la main, pas au build : le jeu ne doit pas dépendre d'un dépôt
// tiers au moment où on y joue. La sortie est commitée.
//
//   node scripts/preparer-mots.mjs
//
// Source : https://github.com/words/an-array-of-french-words (licence MIT).
import { writeFileSync } from 'node:fs';

const SOURCE = 'https://raw.githubusercontent.com/words/an-array-of-french-words/master/index.json';
const LONGUEUR = 5;
const SORTIE = new URL('../src/lib/mot/mots-cinq-lettres.json', import.meta.url);

const reponse = await fetch(SOURCE);
if (!reponse.ok) throw new Error(`Source injoignable : HTTP ${reponse.status}`);
const tous = await reponse.json();

// Lettres seules, accents compris : la saisie se fait sans ponctuation ni
// trait d'union, et les formes accentuées sont de vrais mots français.
const retenus = tous
  .filter((m) => typeof m === 'string' && m.length === LONGUEUR)
  .filter((m) => /^[a-zàâäçéèêëîïôöûùüÿñæœ]+$/.test(m))
  .sort();

writeFileSync(SORTIE, JSON.stringify(retenus), 'utf8');
console.log(`${retenus.length} mots de ${LONGUEUR} lettres écrits dans ${SORTIE.pathname}`);
